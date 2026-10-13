// src/lib/link-safety/rescan.ts
//
// Phase 3: re-check stored links on a schedule. A link that was fine when it was posted can
// turn bad later (a site is hacked, a short link is re-pointed, a feed lists it, the domain
// is reported). Changing a row's status instantly changes what every old post and message
// pointing at it does, which is why links are stored in a table instead of in the text.

import { createAdminClient } from '@/lib/supabase/server'
import { evaluateUrl } from './engine'
import type { LinkRow } from './service'

const CONCURRENCY = 4

export interface RescanResult { checked: number; blocked: number; changed: number; skipped: number }

/** Re-checks the `limit` least recently checked links that are older than `olderThanHours`. Blocked links are left blocked. */
export async function rescanLinks(limit = 40, olderThanHours = 24): Promise<RescanResult> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - olderThanHours * 3_600_000).toISOString()
  const { data } = await admin
    .from('links')
    .select('id, normalized_url, resolved_url, domain, safety_status, block_reason')
    .neq('safety_status', 'blocked')
    .lt('last_checked_at', cutoff)
    .order('last_checked_at', { ascending: true })
    .limit(limit)

  const rows = (data ?? []) as Array<Pick<LinkRow, 'id' | 'normalized_url' | 'resolved_url' | 'domain' | 'safety_status' | 'block_reason'>>
  const out: RescanResult = { checked: 0, blocked: 0, changed: 0, skipped: 0 }

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    await Promise.all(rows.slice(i, i + CONCURRENCY).map(async row => {
      const verdict = await evaluateUrl(row.normalized_url)
      const now = new Date().toISOString()

      if (verdict.kind === 'block') {
        await admin.from('links').update({
          safety_status: 'blocked', block_reason: `rescan:${verdict.reason}`.slice(0, 255),
          resolved_url: verdict.resolved ?? row.resolved_url, domain: (verdict.domain ?? row.domain).slice(0, 255), last_checked_at: now,
        }).eq('id', row.id)
        out.checked++; out.blocked++; out.changed++
        return
      }
      if (verdict.kind === 'allow') {
        const changed = verdict.status !== row.safety_status || verdict.resolved !== row.resolved_url
        await admin.from('links').update({
          safety_status: verdict.status, block_reason: verdict.reason?.slice(0, 255) ?? null,
          resolved_url: verdict.resolved, domain: verdict.domain.slice(0, 255), last_checked_at: now,
        }).eq('id', row.id)
        out.checked++; if (changed) out.changed++
        return
      }
      // 'unverified' (a check is down) or 'invalid': leave the row as it was and try again next run.
      out.skipped++
    }))
  }
  return out
}
