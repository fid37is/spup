// src/lib/actions/phone-kyc.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const nigerianPhoneRegex = /^(\+234|0)[789][01]\d{8}$/

function toE164(phone: string): string {
  const cleaned = phone.replace(/\s+/g, '')
  if (cleaned.startsWith('+234')) return cleaned
  if (cleaned.startsWith('0')) return '+234' + cleaned.slice(1)
  return '+234' + cleaned
}

const phoneSchema = z.object({
  phone: z
    .string()
    .regex(nigerianPhoneRegex, 'Enter a valid Nigerian phone number (e.g. 08012345678)'),
})

const otpSchema = z.object({
  token: z.string().length(6, 'Code must be exactly 6 digits').regex(/^\d{6}$/, 'Digits only'),
})

// ─── Step 1: Send OTP to phone number ─────────────────────────────────────────

export async function sendPhoneOtpAction(phone: string) {
  const parsed = phoneSchema.safeParse({ phone })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const e164 = toE164(phone)

  // Check this phone isn't already linked to a different account
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('phone_number', e164)
    .neq('auth_id', user.id)
    .maybeSingle()

  if (existing) {
    return { error: 'This phone number is already linked to another account.' }
  }

  // Send OTP via Supabase phone auth
  const { error } = await supabase.auth.signInWithOtp({
    phone: e164,
    options: { channel: 'sms' },
  })

  if (error) {
    if (error.message.includes('rate limit') || error.message.includes('too many')) {
      return { error: 'Too many attempts. Please wait a few minutes before trying again.' }
    }
    return { error: 'Failed to send OTP. Please check the number and try again.' }
  }

  return { success: true, phone: e164 }
}

// ─── Step 2: Verify the OTP and link phone to profile ─────────────────────────

export async function verifyPhoneOtpAction(phone: string, token: string) {
  const parsed = otpSchema.safeParse({ token })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  })

  if (error) return { error: 'Invalid or expired code. Please try again.' }

  // Link verified phone to the user's profile
  const { error: updateError } = await supabase
    .from('users')
    .update({
      phone_number: phone,
      bvn_verified: true,   // phone verification is the first KYC step
    })
    .eq('auth_id', user.id)

  if (updateError) return { error: 'Phone verified but failed to update profile. Contact support.' }

  return { success: true }
}

// ─── Resend OTP ────────────────────────────────────────────────────────────────

export async function resendPhoneOtpAction(phone: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.auth.resend({
    type: 'sms',
    phone,
  })

  if (error) {
    if (error.message.includes('rate limit') || error.message.includes('too many')) {
      return { error: 'Too many requests. Please wait before resending.' }
    }
    return { error: 'Failed to resend. Please try again.' }
  }

  return { success: true }
}