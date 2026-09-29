// src/app/(main)/notifications/settings/loading.tsx

import { SettingsSkeletonStyles, SettingsHeaderSkeleton, MenuRowsSkeleton } from '@/components/shared/settings-skeleton'

export default function NotificationSettingsLoading() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <SettingsSkeletonStyles />
      <SettingsHeaderSkeleton withSubtitle />
      <div style={{ padding: '16px 20px' }}>
        <div className="settings-sk" style={{ height: 14, width: '92%', marginBottom: 8 }} />
        <div className="settings-sk" style={{ height: 14, width: '60%' }} />
      </div>
      <MenuRowsSkeleton count={3} />
    </div>
  )
}