// src/lib/actions/testimonials.ts
'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({
  name:         z.string().min(2, 'Enter your name').max(80),
  handle:       z.string().max(40).optional().or(z.literal('')),
  location:     z.string().max(60).optional().or(z.literal('')),
  quote:        z.string().min(20, 'Tell us a bit more — at least 20 characters').max(500, 'Keep it under 500 characters'),
  earned_label: z.string().max(30).optional().or(z.literal('')),
})

export type TestimonialInput = z.infer<typeof schema>

export async function submitTestimonialAction(data: TestimonialInput) {
  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { name, handle, location, quote, earned_label } = parsed.data
  const admin = createAdminClient()

  const { error } = await admin.from('testimonials').insert({
    name,
    handle: handle || null,
    location: location || null,
    quote,
    earned_label: earned_label || null,
    status: 'pending',
  })

  if (error) return { error: 'Something went wrong. Please try again.' }

  return { success: true }
}

// ─── Public landing-page read ────────────────────────────────────────────────
// Only ever returns approved rows — this is what the marketing page renders.

export async function getApprovedTestimonials(limit = 9) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('testimonials')
    .select('id, name, handle, location, quote, earned_label')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('getApprovedTestimonials failed:', error.message)
    return []
  }

  return data || []
}
