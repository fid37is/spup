'use client'

// src/components/profile/share-profile-button.tsx
//
// Round "share" button for a profile header. Same look as the Settings button next to it.

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { useToast } from '@/components/layout/toast'
import { useTranslation } from '@/lib/i18n/language-context'
import { shareProfile } from '@/lib/share-profile'

export default function ShareProfileButton({
  username, displayName,
}: { username: string; displayName: string }) {
  const { t } = useTranslation()
  const { success, error: toastError } = useToast()
  const [busy, setBusy] = useState(false)

  async function handleShare() {
    if (busy) return
    setBusy(true)
    try {
      const result = await shareProfile(
        { username, displayName },
        {
          title: t('profile.share_title', { username }),
          text: t('profile.share_text', { name: displayName, username }),
        },
      )
      if (result === 'copied') success(t('profile.link_copied'))
    } catch {
      toastError(t('profile.share_failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={busy}
      aria-label={t('profile.share_profile')}
      title={t('profile.share_profile')}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 38, height: 38, borderRadius: '50%',
        border: '1px solid var(--color-border)', background: 'none',
        color: 'var(--color-text-primary)', cursor: 'pointer',
        flexShrink: 0, WebkitTapHighlightColor: 'transparent',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Share2 size={16} />
    </button>
  )
}
