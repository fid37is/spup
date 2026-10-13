'use server'

/**
 * links.ts - server actions for link safety that the browser calls directly:
 *   prepareDmLinksAction  checks the links in a direct message before it is encrypted
 *   reportLinkAction      "Report this link" on the interstitial page
 * Links in posts, replies, quotes and bios are checked inside their own actions.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { suspensionBlock } from '@/lib/suspension-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { recordContentFlag } from '@/lib/content-rules'
import { MAX_LINKS_PER_TEXT } from '@/lib/link-safety/config'
import { resolveLink, getLinkBySlug } from '@/lib/link-safety/service'
import { defangUrl } from '@/lib/link-safety/extract'
import { SLUG_RE } from '@/lib/link-safety/short-link'

async function getCaller() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('users').select('id, status').eq('auth_id', user.id).maybeSingle()
  return profile ?? null
}

export type DmLinkResult =
  | { raw: string; action: 'replace'; replacement: string }
  | { raw: string; action: 'keep' }
  | { raw: string; action: 'blocked' }

/**
 * Direct messages are end-to-end encrypted on the phone, so the server never sees a message.
 * To still protect the people receiving links, the sender's app sends ONLY the web addresses
 * found in the message (not the message) and gets back what to put in their place before
 * encrypting: a short link for a checked address, plain text for one we couldn't verify, or
 * "blocked" - in which case the message must not be sent.
 */
export async function prepareDmLinksAction(urls: string[]): Promise<{ results: DmLinkResult[] } | { error: string; code?: 'suspended' | 'rate_limited' }> {
  const profile = await getCaller()
  if (!profile) return { error: 'Not authenticated' }
  if (profile.status === 'banned') return { error: 'Your account is not eligible to send messages.' }
  const suspended = await suspensionBlock(profile)
  if (suspended) return { error: suspended.error, code: 'suspended' }
  if (!(await checkRateLimit(`dmlinks:${profile.id}`, 40, 60))) return { error: 'Too many links. Please wait a moment.', code: 'rate_limited' }

  const unique = [...new Set((urls ?? []).filter(u => typeof u === 'string' && u.length > 0 && u.length <= 2048))]
  const results: DmLinkResult[] = []
  for (const raw of unique.slice(0, MAX_LINKS_PER_TEXT)) {
    const r = await resolveLink(raw, { userId: profile.id, context: 'dm' })
    if (r.kind === 'blocked') results.push({ raw, action: 'blocked' })
    else if (r.kind === 'link') results.push({ raw, action: 'replace', replacement: r.short })
    else if (r.kind === 'unverified') results.push({ raw, action: 'replace', replacement: defangUrl(raw) })
    else results.push({ raw, action: 'keep' })
  }
  for (const raw of unique.slice(MAX_LINKS_PER_TEXT)) results.push({ raw, action: 'replace', replacement: defangUrl(raw) })
  return { results }
}

/** One report per person per link. Reports land in the admin review queue (Trust & safety). */
export async function reportLinkAction(slug: string, reason?: string): Promise<{ success: true } | { error: string }> {
  if (!SLUG_RE.test(slug)) return { error: 'Link not found.' }
  const profile = await getCaller()
  if (!profile) return { error: 'Not authenticated' }
  if (!(await checkRateLimit(`linkreport:${profile.id}`, 10, 3600))) return { error: 'Too many reports. Please try again later.' }

  const link = await getLinkBySlug(slug)
  if (!link) return { error: 'Link not found.' }

  const admin = createAdminClient()
  const { error } = await admin.from('link_reports').insert({
    link_id: link.id, reporter_id: profile.id, reason: reason?.trim().slice(0, 300) || null,
  })
  if (error && error.code !== '23505') return { error: 'Could not send your report. Please try again.' }
  if (error?.code === '23505') return { success: true }              // already reported: nothing more to do

  const { count } = await admin.from('link_reports').select('id', { count: 'exact', head: true }).eq('link_id', link.id)
  await admin.from('links').update({ report_count: count ?? 0 }).eq('id', link.id)

  // Put it in front of a moderator. (If the person who shared it has since left, there is no author to attach it to.)
  // Only the first few reports reach the queue (1st, 3rd, 10th): one entry per report would bury it.
  if (link.created_by && [1, 3, 10].includes(count ?? 1)) {
    await recordContentFlag({
      userId: link.created_by,
      postId: null,
      outcome: 'published',
      matches: [{ term: `reported link (${count ?? 1}): ${link.domain}`.slice(0, 120), action: 'flag', category: 'scam' }],
      text: link.resolved_url,
    })
  }
  return { success: true }
}
