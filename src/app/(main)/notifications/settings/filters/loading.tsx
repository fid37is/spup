// src/app/(main)/notifications/settings/filters/loading.tsx

import { SettingsSkeletonStyles, SettingsHeaderSkeleton, ToggleRowsSkeleton } from '@/components/shared/settings-skeleton'

export default function FiltersLoading() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <SettingsSkeletonStyles />
      <SettingsHeaderSkeleton />
      <div style={{ padding: '16px 20px' }}>
        <div className="settings-sk" style={{ height: 14, width: '90%', marginBottom: 8 }} />
        <div className="settings-sk" style={{ height: 14, width: '60%' }} />
      </div>
      <ToggleRowsSkeleton count={4} />
    </div>
  )
}