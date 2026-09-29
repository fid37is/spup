// src/components/layout/engagement-sync-provider.tsx
'use client'

import { useEffect } from 'react'
import { startEngagementSync, subscribeFailures } from '@/lib/engagement-sync'
import { useToast } from '@/components/layout/toast'
import { useTranslation } from '@/lib/i18n/language-context'

/**
 * Mounted once in the app layout. Sends any like/follow that is still waiting
 * (from a dropped connection or an earlier visit), retries when the phone
 * reconnects or the app is reopened, and tells the person only when the server
 * definitively refuses one (including the follow-spam pause, with its message).
 */
export default function EngagementSyncProvider() {
  const { error: toastError } = useToast()
  const { t } = useTranslation()

  useEffect(() => startEngagementSync(), [])
  useEffect(
    () => subscribeFailures((_kind, _id, message) => toastError(message ?? t('post.update_failed'))),
    [toastError, t],
  )
  return null
}