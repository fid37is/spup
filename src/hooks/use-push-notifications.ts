'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { registerFcmTokenAction } from '@/lib/actions/push'

/**
 * Where a tapped notification should take the user. entityId / actorUsername
 * are the fields PushPayload (lib/push/send.ts) actually sends.
 */
function routeFor(data: Record<string, string> | undefined): string {
  switch (data?.type) {
    case 'new_follower':
      return `/user/${data.actorUsername}`
    case 'post_like':
    case 'post_comment':
    case 'post_repost':
    case 'post_quote':
    case 'mention':
    case 'new_post':
      return `/post/${data.entityId}`
    case 'tip_received':
    case 'subscription_new':
    case 'earning_milestone':
    case 'monetisation_approved':
      return '/wallet'
    case 'new_message':
      return `/messages/${data.entityId}`
    case 'escrow_hold_received':
    case 'escrow_delivered':
    case 'escrow_released':
    case 'escrow_disputed':
    case 'escrow_proposal':
    case 'escrow_escalated':
      return `/wallet/orders/${data.entityId}`
    default:
      return '/notifications'
  }
}

/**
 * Native push (Capacitor + FCM). Does nothing on the web - use-web-push.ts
 * covers browsers.
 *
 * Fixes vs. the previous version:
 *  - listeners are attached BEFORE register(), so the first `registration`
 *    event can't be missed
 *  - listeners are removed on unmount/user change (no duplicates)
 *  - the token is also kept in a cookie so signOutAction can unregister
 *    this phone on logout
 */
export function usePushNotifications(userId: string | undefined) {
  const router = useRouter()

  // Latest router in a ref so the listeners are registered once per user.
  const pushRef = useRef(router.push)
  useEffect(() => {
    pushRef.current = router.push
  })

  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return

    let cancelled = false
    const handles: PluginListenerHandle[] = []

    ;(async () => {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const { Device } = await import('@capacitor/device')

      handles.push(await PushNotifications.addListener('registration', async token => {
        const device = await Device.getInfo()
        const platform = device.platform === 'ios' ? 'ios' : 'android'
        // Read by signOutAction to remove this phone's row on logout.
        document.cookie = `spup_fcm=${token.value}; path=/; max-age=31536000; SameSite=Lax; Secure`
        await registerFcmTokenAction(token.value, platform)
      }))

      handles.push(await PushNotifications.addListener('registrationError', err => {
        console.error('Push registration failed:', err)
      }))

      // No handler for 'pushNotificationReceived' on purpose: with
      // presentationOptions in capacitor.config.ts the system already shows
      // the heads-up banner while the app is open, so an in-app toast on top
      // of it would show every notification twice.

      // User tapped a notification (app in background, or cold start).
      handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', action => {
        pushRef.current(routeFor(action.notification.data))
      }))

      if (cancelled) {
        handles.forEach(h => h.remove())
        return
      }

      // Android only shows a heads-up banner for channels with HIGH
      // importance. Must match CHANNEL_ID in SpupMessagingService.java.
      // (A channel's importance can't be changed from code once it exists,
      // so changing these values later means choosing a new id.)
      if (Capacitor.getPlatform() === 'android') {
        await PushNotifications.createChannel({
          id: 'spup_default',
          name: 'Activity',
          description: 'Messages, likes, follows, payments and other activity',
          importance: 4,   // 4 = HIGH: sound + heads-up banner
          visibility: 1,   // 1 = public on the lock screen
          vibration: true,
        })
      }

      let { receive } = await PushNotifications.checkPermissions()
      if (receive === 'prompt' || receive === 'prompt-with-rationale') {
        ;({ receive } = await PushNotifications.requestPermissions())
      }
      if (receive !== 'granted' || cancelled) return

      await PushNotifications.register()
    })().catch(err => console.error('Push setup failed:', err))

    return () => {
      cancelled = true
      handles.forEach(h => h.remove())
    }
  }, [userId])
}
