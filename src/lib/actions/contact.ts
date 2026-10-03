// src/lib/actions/contact.ts
'use server'

import { createHash } from 'crypto'
import { headers } from 'next/headers'
import { z } from 'zod'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendContactMessageEmail } from '@/lib/email/send'

// Topic -> inbox. Same addresses the Contact page lists. Set CONTACT_TO_EMAIL
// to send everything to one inbox instead (useful until all of these exist).
const TOPIC_INBOX: Record<string, string> = {
  'General enquiry': 'hello@spup.live',
  'Press & media': 'press@spup.live',
  'Creator support': 'creators@spup.live',
  'Report a bug': 'hello@spup.live',
  'Partnership': 'hello@spup.live',
  'Legal / Privacy': 'legal@spup.live',
  'Other': 'hello@spup.live',
}

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(100, 'Name is too long'),
  email: z.string().trim().max(200).pipe(z.email('Enter a valid email address')),
  topic: z.string().refine(t => t in TOPIC_INBOX, 'Pick a topic'),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(4000, 'Message is too long (4,000 characters max)'),
  // Honeypot: real people never see or fill this. Bots usually do.
  website: z.string().max(0).optional(),
})

export type ContactInput = z.input<typeof schema>

export async function sendContactMessageAction(input: ContactInput): Promise<{ success: true } | { error: string }> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    // A filled honeypot lands here too; treat it like a success so bots learn nothing.
    if (typeof input?.website === 'string' && input.website.length > 0) return { success: true }
    return { error: parsed.error.issues[0]?.message ?? 'Check your details and try again' }
  }
  const { name, email, topic, message } = parsed.data

  // Rate limit per visitor and per email address. The IP is hashed so the rate
  // limit table never holds a raw address.
  const h = await headers()
  const ip = (h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0] ?? 'unknown').trim()
  const ipKey = createHash('sha256').update(ip).digest('hex').slice(0, 24)
  const [okIp, okEmail] = await Promise.all([
    checkRateLimit(`contact:ip:${ipKey}`, 5, 3600),
    checkRateLimit(`contact:email:${email.toLowerCase()}`, 3, 3600),
  ])
  if (!okIp || !okEmail) return { error: 'Too many messages. Please try again in an hour.' }

  const to = process.env.CONTACT_TO_EMAIL || TOPIC_INBOX[topic]
  const result = await sendContactMessageEmail(to, { name, email, topic, message })
  if (result.error) {
    console.error('Contact form email failed:', result.error)
    return { error: "We couldn't send your message. Please try again, or email hello@spup.live directly." }
  }
  return { success: true }
}
