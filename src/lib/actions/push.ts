// src/lib/actions/push.ts
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

async function getCallerId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  return profile?.id ?? null
}

export async function subscribeWebPushAction(subscription: {
  endpoint: string
  keys: { p256dh: string; auth: string }
}) {
  const userId = await getCallerId()
  if (!userId) return { error: 'Not authenticated' }
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return { error: 'Invalid subscription' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('user_devices').upsert({
    user_id: userId,
    platform: 'web',
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth_key: subscription.keys.auth,
    fcm_token: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' })

  if (error) return { error: 'Could not save subscription' }
  return { success: true }
}

export async function unsubscribeWebPushAction(endpoint: string) {
  const userId = await getCallerId()
  if (!userId) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  await admin.from('user_devices').delete().eq('user_id', userId).eq('endpoint', endpoint)
  return { success: true }
}

export async function registerFcmTokenAction(token: string, platform: 'android' | 'ios') {
  const userId = await getCallerId()
  if (!userId) return { error: 'Not authenticated' }
  if (!token) return { error: 'Invalid token' }

  const admin = createAdminClient()

  // A device token identifies one physical phone. If someone else was
  // logged in on this phone before, drop their row so their notifications
  // stop arriving for the new user.
  await admin.from('user_devices').delete().eq('fcm_token', token).neq('user_id', userId)

  const { error } = await admin.from('user_devices').upsert({
    user_id: userId,
    platform,
    fcm_token: token,
    endpoint: null,
    p256dh: null,
    auth_key: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,fcm_token' })

  if (error) return { error: 'Could not save device token' }
  return { success: true }
}
