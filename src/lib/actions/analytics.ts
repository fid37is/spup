'use server'

// src/lib/actions/analytics.ts
//
// Records that the signed-in person opened Spup, and from what kind of device
// and where. Called (at most every 30 minutes) by <ActivityBeacon /> in the main
// layout. Feeds the admin Insights page. Never throws and never blocks the UI.

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getRequestContext } from '@/lib/request-context'

const APP_MODES = ['app', 'pwa', 'browser'] as const
type AppMode = (typeof APP_MODES)[number]

export async function recordActivityAction(appMode: string): Promise<{ ok: boolean }> {
  try {
    const mode: AppMode = (APP_MODES as readonly string[]).includes(appMode) ? (appMode as AppMode) : 'browser'

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false }

    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', user.id).single()
    if (!profile) return { ok: false }

    const ctx = await getRequestContext()

    // The service role writes this (the table is closed to everyone else), and
    // the user id comes from the verified session above - never from the client.
    const admin = createAdminClient()
    const { error } = await admin.rpc('record_user_activity', {
      p_user_id: profile.id,
      p_device_type: ctx.device.deviceType === 'unknown' ? null : ctx.device.deviceType,
      p_os: ctx.device.os === 'unknown' ? null : ctx.device.os,
      p_browser: ctx.device.browser === 'unknown' ? null : ctx.device.browser,
      p_app_mode: mode,
      p_country: ctx.country,
      p_region: ctx.region,
    })
    if (error) {
      console.error('[recordActivityAction] record_user_activity failed:', error.message)
      return { ok: false }
    }
    return { ok: true }
  } catch (err) {
    console.error('[recordActivityAction] failed:', err)
    return { ok: false }
  }
}
