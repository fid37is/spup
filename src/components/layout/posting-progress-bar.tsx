'use client'

// A thin progress line pinned to the top of the screen while a post is being
// sent in the background. Purely visual and never interactive
// (pointer-events: none), so it can't get in the way of anything under it.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslation } from '@/lib/i18n/language-context'
import type { ProgressStore, TrackedJob } from '@/lib/posting/progress-store'

type BarSource = Pick<ProgressStore<TrackedJob>, 'subscribe' | 'getSnapshot' | 'getServerSnapshot'>

export default function PostingProgressBar({ store }: { store: BarSource }) {
  const { t } = useTranslation()
  const { visible, value } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)

  // Once hidden the store reports 0, but the line should fade out from where
  // it finished rather than visibly shrinking. So the width is only reset to 0
  // after the fade is over, ready for the next post to start from the left.
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (visible) { setWidth(value); return }
    const reset = setTimeout(() => setWidth(0), 450)
    return () => clearTimeout(reset)
  }, [visible, value])

  return (
    <div
      role="progressbar"
      aria-label={t('composer.sending_aria')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={visible ? value : undefined}
      aria-hidden={!visible}
      style={{
        position: 'fixed',
        // Below the status bar / notch on phones that draw under it (0 elsewhere).
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        right: 0,
        height: 3,
        zIndex: 10000,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease 0.15s',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${width}%`,
          background: 'var(--color-brand)',
          borderRadius: '0 3px 3px 0',
          boxShadow: '0 0 8px var(--color-brand)',
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  )
}
