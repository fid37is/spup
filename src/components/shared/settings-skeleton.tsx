'use client'

// src/components/shared/settings-skeleton.tsx
//
// The notifications/settings/* pages (index, filters, preferences,
// post-notifications) all share the same SettingsHeader + ToggleList /
// MenuRow building blocks from settings-ui.tsx. Rather than duplicate the
// same pixel-matched skeleton four times, the shapes live here once and
// each route's loading.tsx composes them.
//
// Dimensions matched to settings-ui.tsx: header is 56px tall with a 38px
// back button; MenuRow uses a 28px icon column and '16px 20px' padding;
// ToggleList rows use '14px 20px' padding and a 44x24 switch.

export function SettingsSkeletonStyles() {
  return (
    <style>{`
      @keyframes settings-sk-shimmer {
        0%   { opacity: 1;    }
        50%  { opacity: 0.45; }
        100% { opacity: 1;    }
      }
      .settings-sk { animation: settings-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
    `}</style>
  )
}

export function SettingsHeaderSkeleton({ withSubtitle = false }: { withSubtitle?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 20, padding: '0 12px', height: 56,
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div className="settings-sk" style={{ width: 38, height: 38, borderRadius: '50%' }} />
      <div>
        <div className="settings-sk" style={{ height: 17, width: 150, marginBottom: withSubtitle ? 6 : 0 }} />
        {withSubtitle && <div className="settings-sk" style={{ height: 12, width: 90 }} />}
      </div>
    </div>
  )
}

export function MenuRowsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 18, padding: '16px 20px' }}>
          <div className="settings-sk" style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="settings-sk" style={{ height: 15, width: 130, marginBottom: 8 }} />
            <div className="settings-sk" style={{ height: 13, width: '80%' }} />
          </div>
        </div>
      ))}
    </>
  )
}

export function ToggleRowsSkeleton({ count = 4, withDesc = true }: { count?: number; withDesc?: boolean }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ flex: 1 }}>
            <div className="settings-sk" style={{ height: 14, width: 150, marginBottom: withDesc ? 7 : 0 }} />
            {withDesc && <div className="settings-sk" style={{ height: 12, width: '65%' }} />}
          </div>
          <div className="settings-sk" style={{ width: 44, height: 24, borderRadius: 12, flexShrink: 0 }} />
        </div>
      ))}
    </>
  )
}