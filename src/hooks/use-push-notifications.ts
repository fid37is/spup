'use client'

import { useEffect } from 'react'
import { registerFcmTokenAction } from '@/lib/actions/push'

// Dynamically import Capacitor only in native context
async function setupPushNotifications(userId: string) {
  // Only run in Capacitor native environment
  if (typeof window === 'undefined') return
  if (!(window as any).Capacitor?.isNativePlatform()) return

  const { PushNotifications } = await import('@capacitor/push-notifications')
  const { Device } = await import('@capacitor/device')

  const perm = await PushNotifications.requestPermissions()
  if (perm.receive !== 'granted') return

  await PushNotifications.register()

  PushNotifications.addListener('registration', async token => {
    // Was previously hardcoded to 'android' regardless of actual platform,
    // which meant every iOS device silently got mislabeled in user_devices.
    const info = await Device.getInfo()
    const platform = info.platform === 'ios' ? 'ios' : 'android'
    await registerFcmTokenAction(token.value, platform)
  })

  PushNotifications.addListener('pushNotificationReceived', notification => {
    console.log('Foreground notification:', notification)
    // TODO: show in-app toast
  })

  PushNotifications.addListener('pushNotificationActionPerformed', action => {
    const data = action.notification.data
    // Deep-link routing based on notification type. entityId is the field
    // PushPayload (lib/push/send.ts) actually sends - this previously read
    // data.postId, which doesn't exist on that payload at all, so
    // post_like/post_comment taps never routed anywhere.
    switch (data?.type) {
      case 'new_follower':
        window.location.href = `/user/${data.actorUsername}`
        break
      case 'post_like':
      case 'post_comment':
      case 'post_repost':
      case 'post_quote':
        window.location.href = `/post/${data.entityId}`
        break
      case 'tip_received':
      case 'subscription_new':
      case 'earning_milestone':
        window.location.href = '/wallet'
        break
      case 'new_message':
        window.location.href = `/messages/${data.entityId}`
        break
      case 'escrow_hold_received':
      case 'escrow_delivered':
      case 'escrow_released':
      case 'escrow_disputed':
      case 'escrow_proposal':
      case 'escrow_escalated':
        window.location.href = `/wallet/orders/${data.entityId}`
        break
      case 'monetisation_approved':
        window.location.href = '/wallet'
        break
      default:
        window.location.href = '/notifications'
    }
  })
}

export function usePushNotifications(userId: string | undefined) {
  useEffect(() => {
    if (userId) setupPushNotifications(userId)
  }, [userId])
}
