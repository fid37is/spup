// src/app/(main)/notifications/settings/post-notifications/loading.tsx
//
// PostNotificationList rows use a 44px avatar and '12px 20px' padding
// (settings-ui.tsx) - a different shape from the plain ToggleList rows
// used by the other three settings pages, so this one isn't built from
// the shared ToggleRowsSkeleton.

import { SettingsSkeletonStyles, SettingsHeaderSkeleton } from '@/components/shared/settings-skeleton'

export default function PostNotificationsLoading() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <SettingsSkeletonStyles />
      <SettingsHeaderSkeleton />
      <div style={{ padding: '16px 20px' }}>
        <div className="settings-sk" style={{ height: 14, width: '92%', marginBottom: 8 }} />
        <div className="settings-sk" style={{ height: 14, width: '70%' }} />
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="settings-sk" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="settings-sk" style={{ height: 14, width: 130, marginBottom: 7 }} />
            <div className="settings-sk" style={{ height: 12, width: 90 }} />
          </div>
          <div className="settings-sk" style={{ width: 44, height: 24, borderRadius: 12, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}