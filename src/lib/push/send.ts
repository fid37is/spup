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
      throw new Error('Web push is not configured - missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT env vars')
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    webPushConfigured = true
  }
  return webpush
}

/** Returns 'stale' if the subscription is gone and the device row should be deleted, 'ok' otherwise (including on transient failure - we don't want a network blip deleting a valid subscription). */
async function sendWebPush(device: DeviceRow, payload: PushPayload): Promise<'ok' | 'stale'> {
  try {
    const webpush = await getWebPushLib()
    await webpush.sendNotification(
      { endpoint: device.endpoint!, keys: { p256dh: device.p256dh!, auth: device.auth_key! } },
      JSON.stringify(payload)
    )
    return 'ok'
  } catch (err: any) {
    // 404/410 = the browser has unsubscribed or the subscription expired -
    // safe (and necessary) to stop trying this one.
    if (err?.statusCode === 404 || err?.statusCode === 410) return 'stale'
    console.error('Web push send failed:', err?.message || err)
    return 'ok'
  }
}

// ─── FCM (native Android/iOS via Capacitor) ────────────────────────────────

// let fcmApp: import('firebase-admin').app.App | null = null

// async function getFcmMessaging() {
//   const admin = (await import('firebase-admin')).default
//   if (!fcmApp) {
//     const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
//     if (!key) throw new Error('FCM is not configured - missing FIREBASE_SERVICE_ACCOUNT_KEY env var')
//     fcmApp = admin.apps.length
//       ? admin.app()
//       : admin.initializeApp({ credential: admin.credential.cert(JSON.parse(key)) })
//   }
//   return admin.messaging(fcmApp)
// }

// async function sendFcmPush(device: DeviceRow, payload: PushPayload): Promise<'ok' | 'stale'> {
//   try {
//     const messaging = await getFcmMessaging()
//     await messaging.send({
//       token: device.fcm_token!,
//       notification: { title: payload.title, body: payload.body },
//       // FCM data payload values must all be strings.
//       data: {
//         type: payload.type,
//         entityId: payload.entityId || '',
//         actorUsername: payload.actorUsername || '',
//       },
//     })
//     return 'ok'
//   } catch (err: any) {
//     if (err?.code === 'messaging/registration-token-not-registered' || err?.code === 'messaging/invalid-registration-token') {
//       return 'stale'
//     }
//     console.error('FCM push send failed:', err?.message || err)
//     return 'ok'
//   }
// }

// FCM sending isn't implemented yet (see commented block above - needs the
// firebase-admin package plus a service account key). Previously this
// wasn't stubbed at all: sendPushToUser called sendFcmPush() for every
// device with an fcm_token, which doesn't exist as a function, throwing a
// ReferenceError on every native-app push and silently killing the whole
// batch send for that user (caught by the outer try/catch, so it never
// surfaced - pushes to native devices just never arrived). This stub logs
// once and returns 'ok' (not 'stale') so device rows aren't deleted over a
// missing feature rather than a genuinely dead token.
let fcmWarned = false
async function sendFcmPush(_device: DeviceRow, _payload: PushPayload): Promise<'ok' | 'stale'> {
  if (!fcmWarned) {
    console.warn('sendFcmPush: FCM sending is not implemented yet - native push notifications are not being delivered. See src/lib/push/send.ts.')
    fcmWarned = true
  }
  return 'ok'
}

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
        const result = device.fcm_token
          ? await sendFcmPush(device, payload)
          : await sendWebPush(device, payload)

        if (result === 'stale') staleIds.push(device.id)
      })
    )

    if (staleIds.length > 0) {
      await admin.from('user_devices').delete().in('id', staleIds)
    }
  } catch (err) {
    // Push is a best-effort side channel - never let a misconfiguration or
    // an unexpected error here surface to (or block) the caller.
    console.error('sendPushToUser failed:', err)
  }
}
