// src/lib/actions/waitlist.ts
'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({
  full_name: z.string().min(2, 'Enter your full name').max(80),
  phone: z.string().regex(/^(\+234|0)[789][01]\d{8}$/, 'Enter a valid Nigerian phone number').optional().or(z.literal('')),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  referrer: z.string().optional(),
}).refine(d => d.phone || d.email, {
  message: 'Provide a phone number or email',
  path: ['phone'],
})

export type WaitlistInput = z.infer<typeof schema>

export async function joinWaitlistAction(data: WaitlistInput) {
  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { full_name, phone, email, referrer } = parsed.data
  const admin = createAdminClient()

  // Check duplicate
  const { data: existing } = await admin
    .from('waitlist')
    .select('id, position, status')
    .or(`${phone ? `phone.eq.${phone}` : 'id.is.null'}${email ? `,email.eq.${email}` : ''}`)
    .maybeSingle()

  if (existing) {
    return {
      success: true,
      position: existing.position,
      alreadyRegistered: true,
    }
  }

  const { data: row, error } = await admin
    .from('waitlist')
    .insert({
      full_name,
      phone: phone || null,
      email: email || null,
      referrer: referrer || null,
    })
    .select('position')
    .single()

  if (error) return { error: 'Something went wrong. Please try again.' }

  return { success: true, position: row.position, alreadyRegistered: false }
}
export async function getWaitlistCountAction(): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('waitlist')
    .select('id', { count: 'exact', head: true })
  return count || 0
}