// src/lib/link-safety/service.ts
//
// Turns the engine's verdicts into stored links and rewrites text. This is what posts,
// replies, quotes, bios and website fields call before anything is saved:
//
//   const out = await processLinks(body, { userId, context: 'post' })
//   if (out.blocked) -> refuse ("This link can't be shared on Spup") and log a strike
//   else save out.text (links replaced by spup.live/l/<slug>)

import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { recordContentFlag } from '@/lib/content-rules'
import { MAX_LINKS_PER_TEXT, VERDICT_REUSE_MS } from './config'
import { evaluateUrl, type Verdict } from './engine'
import { checkStructure } from './structural'
import { isOwnHost, buildShortUrl } from './short-link'
import { extractLinkTokens, applyReplacements, defangUrl } from './extract'

export type LinkContextKind = 'post' | 'reply' | 'quote' | 'bio' | 'website' | 'dm'
export interface LinkContext {
  userId: string
  context: LinkContextKind
  /** Backfilling old content: don't log strikes or queue review entries for what was found. */
  silent?: boolean
}

export interface LinkRow {
  id: string
  slug: string
  original_url: string
  normalized_url: string
  resolved_url: string
  domain: string
  safety_status: 'safe' | 'unknown' | 'blocked'
  block_reason: string | null
  created_by: string | null
  created_at: string
  last_checked_at: string
  click_count: number
  report_count: number
}

export type Resolution =
  | { kind: 'link'; id: string; slug: string; short: string; status: 'safe' | 'unknown'; domain: string; resolved: string }
  | { kind: 'blocked'; reason: string; slug?: string }
  | { kind: 'unverified' }          // fail open: leave it as plain, non-clickable text
  | { kind: 'own' }                 // one of Spup's own addresses: leave exactly as typed
  | { kind: 'invalid' }             // not a usable link at all

// ─── slugs ───────────────────────────────────────────────────────────────────

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** A random base-62 code, e.g. "xK3p9Aq". Rejection sampling keeps every character equally likely. */
export function generateSlug(length = 7): string {
  let out = ''
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < 248) out += ALPHABET[b % 62]          // 248 = 62 * 4: no modulo bias
      if (out.length === length) break
    }
  }
  return out
}

const LINK_COLUMNS = 'id, slug, original_url, normalized_url, resolved_url, domain, safety_status, block_reason, created_by, created_at, last_checked_at, click_count, report_count'

export async function getLinkBySlug(slug: string): Promise<LinkRow | null> {
  const { data } = await createAdminClient().from('links').select(LINK_COLUMNS).eq('slug', slug).maybeSingle()
  return (data as LinkRow | null) ?? null
}

async function getLinkByNormalized(normalized: string): Promise<LinkRow | null> {
  const { data } = await createAdminClient().from('links').select(LINK_COLUMNS).eq('normalized_url', normalized).maybeSingle()
  return (data as LinkRow | null) ?? null
}

/** Stores a verdict as a links row (inserting, or updating the existing row for that address). */
async function saveVerdict(
  verdict: Extract<Verdict, { kind: 'allow' } | { kind: 'block' }>,
  raw: string,
  createdBy: string,
): Promise<LinkRow | null> {
  const admin = createAdminClient()
  const normalized = verdict.normalized
  if (!normalized || !verdict.domain) return null              // nothing meaningful to store
  const resolved = verdict.resolved ?? normalized
  const fields = {
    resolved_url: resolved,
    domain: verdict.domain.slice(0, 255),
    safety_status: verdict.kind === 'allow' ? verdict.status : 'blocked',
    block_reason: verdict.reason?.slice(0, 255) ?? null,
    last_checked_at: new Date().toISOString(),
  }

  const existing = await getLinkByNormalized(normalized)
  if (existing) {
    const { data } = await admin.from('links').update(fields).eq('id', existing.id).select(LINK_COLUMNS).single()
    return (data as LinkRow | null) ?? { ...existing, ...fields } as LinkRow
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await admin
      .from('links')
      .insert({ slug: generateSlug(attempt < 3 ? 7 : 8), original_url: raw.slice(0, 2048), normalized_url: normalized, created_by: createdBy, ...fields })
      .select(LINK_COLUMNS)
      .single()
    if (!error) return data as LinkRow
    if (error.code !== '23505') { console.error('[link-safety] insert failed:', error.message); return null }
    // Unique violation: either the slug was taken (try another) or someone stored this address a moment ago (use theirs).
    const raced = await getLinkByNormalized(normalized)
    if (raced) return raced
  }
  return null
}

// ─── strikes ─────────────────────────────────────────────────────────────────

/**
 * Logs an attempt to share a blocked link: a strike against the account, and an entry in the
 * admin review queue (Trust & safety). Never throws - logging must not break posting.
 */
export async function recordBlockedAttempt(ctx: LinkContext, url: string, reason: string, linkId?: string | null) {
  if (ctx.silent) return
  try {
    const admin = createAdminClient()
    // The same person retrying the same link within the hour is one incident.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await admin.from('link_strikes').select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId).eq('url', url.slice(0, 2048)).gte('created_at', since)
    if ((count ?? 0) > 0) return
    await admin.from('link_strikes').insert({
      user_id: ctx.userId, link_id: linkId ?? null, url: url.slice(0, 2048), reason: reason.slice(0, 255), context: ctx.context,
    })
    await recordContentFlag({
      userId: ctx.userId,
      postId: null,
      outcome: 'blocked',
      matches: [{ term: `unsafe link: ${reason}`.slice(0, 120), action: 'block', category: 'scam' }],
      text: url,
    })
  } catch (err) {
    console.error('[link-safety] strike logging failed:', err)
  }
}

// ─── resolving one link ──────────────────────────────────────────────────────

/** Checks one link (with the stored verdict reused when it is recent) and returns what to do with it. */
export async function resolveLink(raw: string, ctx: LinkContext): Promise<Resolution> {
  const structure = checkStructure(raw)
  if (structure.ok && isOwnHost(structure.url.hostname)) return { kind: 'own' }

  // A recent stored verdict saves every API call.
  if (structure.ok) {
    const existing = await getLinkByNormalized(structure.url.href)
    if (existing) {
      if (existing.safety_status === 'blocked') {
        await recordBlockedAttempt(ctx, raw, existing.block_reason ?? 'blocked_link', existing.id)
        return { kind: 'blocked', reason: existing.block_reason ?? 'blocked_link', slug: existing.slug }
      }
      if (Date.now() - new Date(existing.last_checked_at).getTime() < VERDICT_REUSE_MS) {
        return toLinkResolution(existing)
      }
    }
  }

  const verdict = await evaluateUrl(raw)
  switch (verdict.kind) {
    case 'invalid': return { kind: 'invalid' }
    case 'unverified': return { kind: 'unverified' }
    case 'block': {
      const row = await saveVerdict(verdict, raw, ctx.userId)
      await recordBlockedAttempt(ctx, raw, verdict.reason, row?.id)
      return { kind: 'blocked', reason: verdict.reason, slug: row?.slug }
    }
    case 'allow': {
      const row = await saveVerdict(verdict, raw, ctx.userId)
      // Couldn't store it (database trouble): fail open, but as plain text - no slug, no redirect.
      if (!row) return { kind: 'unverified' }
      if (row.safety_status === 'blocked') return { kind: 'blocked', reason: row.block_reason ?? 'blocked_link', slug: row.slug }
      return toLinkResolution(row)
    }
  }
}

function toLinkResolution(row: LinkRow): Resolution {
  return {
    kind: 'link', id: row.id, slug: row.slug, short: buildShortUrl(row.slug),
    status: row.safety_status === 'safe' ? 'safe' : 'unknown', domain: row.domain, resolved: row.resolved_url,
  }
}

// ─── whole texts ─────────────────────────────────────────────────────────────

export interface ProcessedText {
  text: string
  /** Set when a link was blocked: the text must NOT be saved. */
  blocked: { url: string; reason: string } | null
  /** The stored links now in the text, in order (used for the link preview card). */
  links: Array<Extract<Resolution, { kind: 'link' }>>
}

/**
 * Checks every link in `text` and returns the text with each one replaced:
 *   safe / unknown  -> https://spup.live/l/<slug>
 *   couldn't verify -> plain text, not clickable
 *   Spup's own      -> unchanged
 * If any link is blocked, `blocked` is set and the caller must refuse the whole text.
 * (`keepBlocked` is for old content that already exists: a blocked link is swapped for its short
 * link, which then shows as blocked, instead of refusing anything.)
 */
export async function processLinks(text: string, ctx: LinkContext, options: { keepBlocked?: boolean } = {}): Promise<ProcessedText> {
  const tokens = extractLinkTokens(text)
  if (tokens.length === 0) return { text, blocked: null, links: [] }

  const unique = [...new Set(tokens.map(t => t.raw))]
  const toCheck = unique.slice(0, MAX_LINKS_PER_TEXT)
  const results = await Promise.all(toCheck.map(raw => resolveLink(raw, ctx)))

  const replacements = new Map<string, string>()
  const links: ProcessedText['links'] = []
  for (let i = 0; i < toCheck.length; i++) {
    const raw = toCheck[i]
    const r = results[i]
    if (r.kind === 'blocked') {
      if (options.keepBlocked && r.slug) { replacements.set(raw, buildShortUrl(r.slug)); continue }
      if (options.keepBlocked) { replacements.set(raw, defangUrl(raw)); continue }
      return { text, blocked: { url: raw, reason: r.reason }, links: [] }
    }
    if (r.kind === 'link') { replacements.set(raw, r.short); links.push(r) }
    else if (r.kind === 'unverified') replacements.set(raw, defangUrl(raw))
    // 'own' and 'invalid': left exactly as typed
  }
  // More links than we check in one go: the extra ones go out as plain text.
  for (const raw of unique.slice(MAX_LINKS_PER_TEXT)) replacements.set(raw, defangUrl(raw))

  return { text: applyReplacements(text, tokens, replacements), blocked: null, links }
}
