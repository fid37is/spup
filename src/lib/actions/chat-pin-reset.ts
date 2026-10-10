'use server'

// src/lib/actions/chat-pin-reset.ts
//
// "Forgot PIN" for the chat PIN gate. The old PIN can't be asked for, so the
// person proves they own the account instead: a 6-digit code is emailed to the
// address on the account, and only a correct code lets a new PIN be saved.
//
// The E2E key backup is wrapped with `${PIN}:${pepper}`, so a new PIN also means
// re-wrapping it. That happens in the browser (the server never sees the key):
//   - this device still has the chat key -> it is re-wrapped under the new PIN,
//     history stays readable and recoverable on other devices;
//   - this device does NOT have it -> the old backup can no longer be opened by
//     anyone, so it is cleared and a fresh chat key is created on next use
//     (messages encrypted to the old key can't be read again).
// The pepper is kept the same (rotating it would orphan an existing wrap).

import { createClient } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'
import nodeCrypto from 'crypto'
import { checkRateLimit } from '@/lib/rate-limit'

const RESET_ERROR = "We couldn't reset your PIN right now. Please try again in a moment."

async function getCaller() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { supabase, user: null, profile: null }
  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  return { supabase, user, profile }
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, Math.min(name.length - 2, 6)))}@${domain}`
}

/** Emails a 6-digit code to the account's address. */
export async function requestChatPinResetAction() {
  const { supabase, user, profile } = await getCaller()
  if (!user || !profile) return { error: 'Not authenticated' }

  if (!(await checkRateLimit(`chat-pin-reset-request:${profile.id}`, 3, 15 * 60))) {
    return { error: 'Too many requests. Please wait a few minutes and try again.' }
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: user.email!,
    options: { shouldCreateUser: false },
  })
  if (error) {
    console.error('[requestChatPinResetAction] could not send code:', error.message)
    return { error: "We couldn't send the code right now. Please try again in a moment." }
  }
  return { success: true as const, email: maskEmail(user.email!) }
}

/**
 * Checks the emailed code and, if correct, saves the new PIN. Returns the pepper
 * and the profile id so the browser can re-wrap its chat key under the new PIN
 * (then calls finishChatPinResetAction).
 */
export async function confirmChatPinResetAction(code: string, newPin: string) {
  if (!/^\d{6}$/.test(code)) return { error: 'Enter the 6-digit code from your email.' }
  if (!/^\d{4}$/.test(newPin)) return { error: 'PIN must be exactly 4 digits' }

  const { supabase, user, profile } = await getCaller()
  if (!user || !profile) return { error: 'Not authenticated' }

  // Guessing the code is a brute-force path to taking over the chat PIN.
  if (!(await checkRateLimit(`chat-pin-reset-confirm:${profile.id}`, 5, 15 * 60))) {
    return { error: 'Too many attempts. Please wait a few minutes and try again.' }
  }

  const { error: otpError } = await supabase.auth.verifyOtp({ email: user.email!, token: code, type: 'email' })
  if (otpError) return { error: 'Invalid or expired code. Please try again.' }

  // The code must have belonged to THIS account.
  const { data: { user: after } } = await supabase.auth.getUser()
  if (!after || after.id !== user.id) return { error: RESET_ERROR }

  const { data: row, error: rowError } = await supabase
    .from('chat_pins').select('key_pepper').eq('user_id', profile.id).maybeSingle()
  if (rowError) { console.error('[confirmChatPinResetAction] could not read chat_pins:', rowError); return { error: RESET_ERROR } }

  const pepper = row?.key_pepper ?? nodeCrypto.randomBytes(32).toString('base64')
  const pin_hash = await bcrypt.hash(newPin, 10)
  const { error: saveError } = await supabase.from('chat_pins').upsert(
    { user_id: profile.id, pin_hash, key_pepper: pepper, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
  if (saveError) { console.error('[confirmChatPinResetAction] could not save PIN:', saveError); return { error: RESET_ERROR } }

  return { success: true as const, pepper, userId: profile.id as string }
}

/**
 * This device had no chat key to re-wrap, so the old backup (locked with the
 * forgotten PIN) is useless: clear it so a fresh one is made under the new PIN.
 */
export async function clearChatKeyBackupAction() {
  const { supabase, profile } = await getCaller()
  if (!profile) return { error: 'Not authenticated' }
  const { error } = await supabase
    .from('users')
    .update({ wrapped_private_key: null, key_wrap_salt: null, key_wrap_iv: null })
    .eq('id', profile.id)
  if (error) { console.error('[clearChatKeyBackupAction] failed:', error.message); return { error: RESET_ERROR } }
  return { success: true as const }
}
