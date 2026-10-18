// src/app/(main)/compose/loading.tsx
//
// Shown the instant "New post" is tapped, while the page itself loads - so on a
// slow connection the screen changes immediately instead of appearing frozen.

export default function ComposeLoading() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 150, background: 'var(--color-bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', paddingTop: 'calc(12px + env(safe-area-inset-top))',
      }}>
        <div style={{ width: 30, height: 30 }} />
        <div style={{
          background: 'var(--color-surface-2)', borderRadius: 20, minHeight: 36, width: 78,
        }} />
      </div>
    </div>
  )
}
