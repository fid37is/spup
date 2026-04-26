'use client'

import { useEffect } from 'react'
import { createBrowserClient as createClient } from '@/lib/supabase/client'

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
    const info = { platform: 'android' }
    const supabase = createClient()

    // Save token to user_devices table
    await supabase.from('user_devices').upsert({
      user_id: userId,
      fcm_token: token.value,
      platform: info.platform,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,fcm_token' })
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
