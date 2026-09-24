// src/hooks/use-web-push.ts
'use client'

import { useEffect } from 'react'
import { subscribeWebPushAction } from '@/lib/actions/push'

// PushManager.subscribe() needs the VAPID public key as raw bytes, not the
// base64url string it's normally shared as.
function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export type WebPushStatus =
  | 'subscribed'      // this browser is subscribed and registered with the server
  | 'native'          // native app shell - handled by use-push-notifications.ts
  | 'denied'          // the user blocked notifications in the browser
  | 'unsupported'     // browser has no service worker / push support
  | 'not-configured'  // no VAPID key in this environment
  | 'error'

async function setupWebPush(): Promise<WebPushStatus> {
  if (typeof window === 'undefined') return 'unsupported'
  // Native app shell handles push via Capacitor/FCM instead (see
  // use-push-notifications.ts) — subscribing to web push too would
  // register the same physical device twice and double-deliver pushes.
  if ((window as any).Capacitor?.isNativePlatform()) return 'native'

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) return 'not-configured' // push not configured in this environment

  if (Notification.permission === 'denied') return 'denied'

  try {
    const registration = await navigator.serviceWorker.ready

    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return 'denied'
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      })
    }

    const json = subscription.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'error'

    await subscribeWebPushAction({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    })
    return 'subscribed'
  } catch (err) {
    console.error('Web push subscription failed:', err)
    return 'error'
  }
}

/**
 * Ask for browser permission (if needed), subscribe this device and register
 * it with the server. Called when the user switches "Push notifications" ON in
 * Notification settings - so the switch actually does something on this device.
 */
export function enableWebPush(): Promise<WebPushStatus> {
  return setupWebPush()
}

export function useWebPush(userId: string | undefined) {
  useEffect(() => {
    if (userId) void setupWebPush()
  }, [userId])
}
