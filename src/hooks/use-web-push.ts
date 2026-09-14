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

async function setupWebPush(userId: string) {
  if (typeof window === 'undefined') return
  // Native app shell handles push via Capacitor/FCM instead (see
  // use-push-notifications.ts) — subscribing to web push too would
  // register the same physical device twice and double-deliver pushes.
  if ((window as any).Capacitor?.isNativePlatform()) return

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) return // push not configured in this environment

  if (Notification.permission === 'denied') return

  try {
    const registration = await navigator.serviceWorker.ready

    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      })
    }

    const json = subscription.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return

    await subscribeWebPushAction({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    })
  } catch (err) {
    console.error('Web push subscription failed:', err)
  }
}

export function useWebPush(userId: string | undefined) {
  useEffect(() => {
    if (userId) setupWebPush(userId)
  }, [userId])
}
