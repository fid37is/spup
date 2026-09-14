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
    // Deep-link routing based on notification type
    if (data?.type === 'new_follower') window.location.href = `/profile/${data.actorUsername}`
    if (data?.type === 'post_like' || data?.type === 'post_comment') window.location.href = `/post/${data.postId}`
    if (data?.type === 'tip_received') window.location.href = '/wallet'
  })
}

export function usePushNotifications(userId: string | undefined) {
  useEffect(() => {
    if (userId) setupPushNotifications(userId)
  }, [userId])
}
