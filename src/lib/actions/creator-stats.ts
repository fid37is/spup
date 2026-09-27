// src/lib/actions/creator-stats.ts
'use server'

import { createAdminClient } from '@/lib/supabase/server'

/**
 * How many real, active creators are on Spup right now - used for public
 * social-proof numbers (e.g. the home page), as opposed to
 * getWaitlistCountAction() which only counts people who've signed up to be
 * invited and haven't necessarily created an account yet.
 *
 * "Active creator" = a non-deleted, non-suspended/banned account, excluding
 * staff (admin/moderator) so the number reflects real users of the app.
 */
export async function getActiveCreatorCountAction(): Promise<number> {
  const admin = createAdminClient()
  const { count, error } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('status', 'active')
    .not('role', 'in', '(admin,moderator)')

  if (error) {
    // Don't swallow this silently - see getWaitlistCountAction for why:
    // a failed query here would otherwise freeze a false "0" into the page.
    console.error('getActiveCreatorCountAction failed:', error.message)
  }

  return count || 0
}