// src/app/(main)/notifications/settings/preferences/loading.tsx

import { SettingsSkeletonStyles, SettingsHeaderSkeleton, ToggleRowsSkeleton } from '@/components/shared/settings-skeleton'

export default function PreferencesLoading() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <SettingsSkeletonStyles />
      <SettingsHeaderSkeleton />
      <div style={{ padding: '16px 20px' }}>
        <div className="settings-sk" style={{ height: 14, width: '75%' }} />
      </div>

      {/* "Where you get notified" - 2 rows */}
      <div style={{ padding: '22px 20px 10px' }}>
        <div className="settings-sk" style={{ height: 18, width: 160 }} />
      </div>
      <ToggleRowsSkeleton count={2} />

      {/* "What you get notified about" - 8 rows */}
      <div style={{ padding: '22px 20px 10px' }}>
        <div className="settings-sk" style={{ height: 18, width: 200 }} />
      </div>
      <ToggleRowsSkeleton count={8} />
    </div>
  )
}