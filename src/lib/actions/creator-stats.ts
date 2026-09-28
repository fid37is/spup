// src/lib/actions/creator-stats.ts
'use server'

import { createAdminClient } from '@/lib/supabase/server'

/**
 * How many real, active creators are on Spup right now - used for public
 * social-proof numbers (e.g. the home page), as opposed to
 * getWaitlistCountAction() which only counts people who've signed up to be
 * invited and haven't necessarily created an account yet.
 *
 * Counts every member who is still in good standing: active accounts plus
 * ones still pending email verification (they've joined, they just haven't
 * confirmed yet). Suspended/banned and deleted accounts are left out, and so
 * is the admin account, since that isn't a member.
 */
export async function getActiveCreatorCountAction(): Promise<number> {
  const admin = createAdminClient()
  const { count, error } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .in('status', ['active', 'pending_verification'])
    .neq('role', 'admin')

  if (error) {
    // Don't swallow this silently - see getWaitlistCountAction for why:
    // a failed query here would otherwise freeze a false "0" into the page.
    console.error('getActiveCreatorCountAction failed:', error.message)
  }

  return count || 0
}