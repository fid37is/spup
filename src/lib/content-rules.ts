// src/lib/content-rules.ts
// Server-side half of the word rules: loads the admin-managed list (cached
// briefly), screens text against it, and writes matches to the review queue.
import { createAdminClient } from '@/lib/supabase/server'
import { scanText, hasBlock, type ContentRule, type RuleMatch } from '@/lib/content-scan'

export type { ContentRule, RuleMatch } from '@/lib/content-scan'

const CACHE_MS = 60_000
let cache: { rules: ContentRule[]; at: number } | null = null

/** Call after the admin edits rules so this server instance sees it at once. */
export function invalidateContentRulesCache() {
  cache = null
}

async function loadRules(): Promise<ContentRule[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rules
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('content_rules')
    .select('id, term, match_type, action, category')
    .eq('is_active', true)
  if (error) {
    // A broken rules table must never stop people from posting.
    console.error('[content-rules] load failed, skipping screen:', error.message)
    return cache?.rules ?? []
  }
  cache = { rules: (data ?? []) as ContentRule[], at: Date.now() }
  return cache.rules
}

export interface ScreenResult {
  /** flag + block matches - these go to the review queue. */
  matches: RuleMatch[]
  blocked: boolean
  /** Matched a "support" rule (e.g. self-harm wording): publish, and show the author help resources. */
  needsSupport: boolean
}

export async function screenContent(text: string | null | undefined): Promise<ScreenResult> {
  const value = (text ?? '').trim()
  if (!value) return { matches: [], blocked: false, needsSupport: false }
  try {
    const all = scanText(value, await loadRules())
    // "support" matches are deliberately kept out of the review queue: someone
    // in distress should be offered help, not treated as a rule-breaker.
    const matches = all.filter(m => m.action !== 'support')
    return {
      matches,
      blocked: hasBlock(matches),
      needsSupport: all.some(m => m.action === 'support'),
    }
  } catch (err) {
    console.error('[content-rules] screen failed, skipping:', err)
    return { matches: [], blocked: false, needsSupport: false }
  }
}

/** Queues a match for admin review. Never throws - moderation logging must not break posting. */
export async function recordContentFlag(args: {
  userId: string
  postId: string | null
  outcome: 'published' | 'blocked'
  matches: RuleMatch[]
  text: string | null | undefined
}) {
  if (args.matches.length === 0) return
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('content_flags').insert({
      user_id: args.userId,
      post_id: args.postId,
      outcome: args.outcome,
      matched_terms: [...new Set(args.matches.map(m => m.term))],
      categories: [...new Set(args.matches.map(m => m.category))],
      snippet: (args.text ?? '').trim().slice(0, 280) || null,
    })
    if (error) console.error('[content-rules] flag insert failed:', error.message)
  } catch (err) {
    console.error('[content-rules] flag insert threw:', err)
  }
}
