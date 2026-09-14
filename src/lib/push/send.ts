// src/lib/push/send.ts
//
// The actual send mechanism that was missing entirely: user_devices rows
// existed, the service worker could display a push if one arrived, but
// nothing anywhere called Web Push or FCM to make one arrive. This module
// is that piece.

import { createAdminClient } from '@/lib/supabase/server'

export interface PushPayload {
  title: string
  body: string
  type: string
  entityId?: string
  actorUsername?: string
}

interface DeviceRow {
  id: string
  fcm_token: string | null
  endpoint: string | null
  p256dh: string | null
  auth_key: string | null
}

// ─── Web Push (browsers / installed PWA, via public/sw.js) ────────────────

let webPushConfigured = false

async function getWebPushLib() {
  const webpush = (await import('web-push')).default
  if (!webPushConfigured) {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
      throw new Error('Web push is not configured — missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT env vars')
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    webPushConfigured = true
  }
  return webpush
}

/** Returns 'stale' if the subscription is gone and the device row should be deleted, 'ok' otherwise (including on transient failure — we don't want a network blip deleting a valid subscription). */
async function sendWebPush(device: DeviceRow, payload: PushPayload): Promise<'ok' | 'stale'> {
  try {
    const webpush = await getWebPushLib()
    await webpush.sendNotification(
      { endpoint: device.endpoint!, keys: { p256dh: device.p256dh!, auth: device.auth_key! } },
      JSON.stringify(payload)
    )
    return 'ok'
  } catch (err: any) {
    // 404/410 = the browser has unsubscribed or the subscription expired —
    // safe (and necessary) to stop trying this one.
    if (err?.statusCode === 404 || err?.statusCode === 410) return 'stale'
    console.error('Web push send failed:', err?.message || err)
    return 'ok'
  }
}

// ─── Native (Android/iOS via Capacitor) — deferred ─────────────────────────
//
// Not implemented yet — deliberately. Sending to native devices needs some
// provider (Firebase Cloud Messaging is the standard one for Capacitor
// apps) which means creating a Firebase project first; that's a real
// account-setup step outside of what code alone can do, and isn't needed
// right now since only web push is in use. The `user_devices` schema
// (migration 015) already supports fcm_token rows — usePushNotifications
// still registers native tokens when running inside a Capacitor build, so
// they'll be sitting ready in the table. To wire up sending later: add the
// `firebase-admin` package back, and a sendFcmPush() here following the
// same (device, payload) => Promise<'ok' | 'stale'> shape as sendWebPush
// below, then call it from sendPushToUser for devices with fcm_token set.

// ─── Public entry point ────────────────────────────────────────────────────

/**
 * Sends a push notification to every device registered for a user.
 * Best-effort and fire-and-forget by design: a push failure (or push not
 * being configured at all in this environment) never throws, so callers
 * can call this after creating an in-app notification without needing to
 * wrap it in their own try/catch.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: devices } = await admin
      .from('user_devices')
      .select('id, fcm_token, endpoint, p256dh, auth_key')
      .eq('user_id', userId)

    if (!devices || devices.length === 0) return

    const staleIds: string[] = []

    await Promise.all(
      devices.map(async (device: DeviceRow) => {
        // Native (fcm_token) rows are skipped — see note above. They're
        // left in the table rather than deleted; nothing here treats them
        // as stale, since the token itself may well still be valid.
        if (device.fcm_token) return

        const result = await sendWebPush(device, payload)
        if (result === 'stale') staleIds.push(device.id)
      })
    )

    if (staleIds.length > 0) {
      await admin.from('user_devices').delete().in('id', staleIds)
    }
  } catch (err) {
    // Push is a best-effort side channel — never let a misconfiguration or
    // an unexpected error here surface to (or block) the caller.
    console.error('sendPushToUser failed:', err)
  }
}
