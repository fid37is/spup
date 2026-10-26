// src/lib/feature-flags.ts
//
// Admin-controlled on/off switches for the whole platform. Server only.
//
// They live in platform_settings (key/value, see migration 017) and are flipped from the admin
// site: Features -> Feature switches (src/app/(admin)/features). Add a switch by adding a row to
// FEATURE_FLAGS below - the admin page and the toggle action pick it up from there, and the
// action refuses any key that isn't listed.
//
// If a row is missing or the read fails, the flag's `defaultValue` is used, so a database hiccup
// never silently flips a feature.

import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { isPremiumActive } from '@/lib/premium'

export interface FeatureFlagDef {
  key: string
  label: string
  description: string
  /** Used when the setting has never been saved (or can't be read). */
  defaultValue: boolean
  /** What each state means, shown under the switch. */
  onText: string
  offText: string
}

export const FEATURE_FLAGS = [
  {
    key: 'analytics_free_for_all',
    label: 'Analytics free for everyone',
    description: 'The /analytics page (charts, audience, active times, top posts) normally needs Spup Premium.',
    defaultValue: true,
    onText: 'On - every user can open Analytics, no Premium needed. Switch off once Premium subscriptions are working.',
    offText: 'Off - Analytics is a Premium feature; people without active Premium see the upgrade screen.',
  },
] as const satisfies readonly FeatureFlagDef[]

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number]['key']

export function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return FEATURE_FLAGS.some(f => f.key === key)
}

/** Current value of one switch. */
export async function getFeatureFlag(key: FeatureFlagKey): Promise<boolean> {
  const fallback = FEATURE_FLAGS.find(f => f.key === key)!.defaultValue
  try {
    const { data, error } = await createAdminClient()
      .from('platform_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    if (error || !data) return fallback
    if (data.value === true || data.value === 'true') return true
    if (data.value === false || data.value === 'false') return false
    return fallback
  } catch {
    return fallback
  }
}

/** Current value of every switch, for the admin page. */
export async function getAllFeatureFlags(): Promise<Record<FeatureFlagKey, boolean>> {
  const entries = await Promise.all(FEATURE_FLAGS.map(async f => [f.key, await getFeatureFlag(f.key)] as const))
  return Object.fromEntries(entries) as Record<FeatureFlagKey, boolean>
}

/**
 * May this user open Analytics? Yes for everyone while the "Analytics free for everyone" switch is
 * on; otherwise only with active Premium. This is the ONLY place that decides it - the analytics
 * queries call it themselves, so the data can't be reached any other way.
 */
export async function hasAnalyticsAccess(userId: string): Promise<boolean> {
  if (await getFeatureFlag('analytics_free_for_all')) return true
  return isPremiumActive(userId)
}
