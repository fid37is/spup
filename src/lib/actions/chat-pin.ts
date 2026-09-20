'use server'

// src/lib/actions/chat-pin.ts
//
// Changing the chat PIN. Kept in its own file (rather than messages.ts) so it
// doesn't touch the existing PIN/messaging actions.
//
// Three things must move together when the PIN changes:
//   1. chat_pins.pin_hash   - what the PIN gate checks
//   2. the wrapped E2E key  - it's encrypted with a key derived from
//                             `${PIN}:${pepper}`, so it has to be re-wrapped
//                             with the new PIN or a NEW DEVICE could no longer
//                             recover the user's message history
//   3. the pepper           - deliberately kept the same (rotating it would
//                             orphan the wrapped key); only created if this
//                             user somehow never had one
// The re-wrapping happens in the browser (the server never sees the key or the
// PIN-derived secret); this action verifies the current PIN and saves both
// changes, undoing the first if the second fails.

import { createClient } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'
import nodeCrypto from 'crypto'
import { checkRateLimit } from '@/lib/rate-limit'

const CHANGE_ERROR = "We couldn't change your PIN right now. Please try again in a moment."

type WrappedKey = { wrapped: string; salt: string; iv: string }

function isWrappedKey(v: unknown): v is WrappedKey {
  const w = v as WrappedKey | null
  return !!w
    && typeof w.wrapped === 'string' && w.wrapped.length > 0 && w.wrapped.length < 20_000
    && typeof w.salt === 'string' && w.salt.length > 0 && w.salt.length < 200
    && typeof w.iv === 'string' && w.iv.length > 0 && w.iv.length < 200
}

export async function changeChatPinAction(oldPin: string, newPin: string, rewrapped?: WrappedKey | null) {
  if (!/^\d{4}$/.test(oldPin) || !/^\d{4}$/.test(newPin)) return { error: 'PINs must be exactly 4 digits' }
  if (oldPin === newPin) return { error: 'Your new PIN must be different from your current one' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return { error: 'Not authenticated' }

  // Guessing the current PIN through this action is a brute-force path, so
  // limit it: 5 tries per 15 minutes.
  if (!(await checkRateLimit(`chat-pin-change:${profile.id}`, 5, 15 * 60))) {
    return { error: 'Too many attempts. Please wait a few minutes and try again.' }
  }

  const { data: row, error: rowError } = await supabase
    .from('chat_pins').select('pin_hash, key_pepper').eq('user_id', profile.id).maybeSingle()
  if (rowError) { console.error('[changeChatPinAction] could not read chat_pins:', rowError); return { error: CHANGE_ERROR } }
  if (!row) return { error: "You haven't set a chat PIN yet." }

  if (!(await bcrypt.compare(oldPin, row.pin_hash))) return { error: 'Current PIN is incorrect' }

  const pepperIsNew = !row.key_pepper
  const pepper = row.key_pepper ?? nodeCrypto.randomBytes(32).toString('base64')

  // A wrapped key made without knowing the (new) pepper can't be valid - ignore
  // it in that case; the browser re-wraps afterwards using the pepper we return.
  const wrapped = !pepperIsNew && isWrappedKey(rewrapped) ? rewrapped : null

  // Keep the old wrapped key so we can put it back if saving the PIN fails.
  let previous: { wrapped_private_key: string | null; key_wrap_salt: string | null; key_wrap_iv: string | null } | null = null
  if (wrapped) {
    const { data: prev } = await supabase
      .from('users').select('wrapped_private_key, key_wrap_salt, key_wrap_iv').eq('id', profile.id).single()
    previous = prev ?? null
    const { error: wrapError } = await supabase
      .from('users')
      .update({ wrapped_private_key: wrapped.wrapped, key_wrap_salt: wrapped.salt, key_wrap_iv: wrapped.iv })
      .eq('id', profile.id)
    if (wrapError) { console.error('[changeChatPinAction] could not save re-wrapped key:', wrapError); return { error: CHANGE_ERROR } }
  }

  const pin_hash = await bcrypt.hash(newPin, 10)
  const { error: saveError } = await supabase.from('chat_pins').upsert(
    { user_id: profile.id, pin_hash, key_pepper: pepper, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
  if (saveError) {
    console.error('[changeChatPinAction] could not save new PIN:', saveError)
    if (wrapped && previous) {
      const { error: undoError } = await supabase
        .from('users')
        .update({
          wrapped_private_key: previous.wrapped_private_key,
          key_wrap_salt: previous.key_wrap_salt,
          key_wrap_iv: previous.key_wrap_iv,
        })
        .eq('id', profile.id)
      if (undoError) console.error('[changeChatPinAction] could not restore previous wrapped key:', undoError)
    }
    return { error: CHANGE_ERROR }
  }

  return { success: true as const, pepper, pepperIsNew }
}
