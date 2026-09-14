// src/components/layout/push-notifications-provider.tsx
'use client'

import { useWebPush } from '@/hooks/use-web-push'
import { usePushNotifications } from '@/hooks/use-push-notifications'

export default function PushNotificationsProvider({ userId }: { userId: string }) {
  useWebPush(userId)
  usePushNotifications(userId)
  return null
}
