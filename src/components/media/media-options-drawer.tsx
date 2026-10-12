'use client'

// src/components/media/media-options-drawer.tsx
//
// What the viewer's "..." button opens: a bottom drawer with "Share via..." and
// "Save image" / "Save video", laid out like the Threads sheet. Used by both the
// post viewer and the chat viewer. The actual work is in lib/save-media.ts.

import { Download, Share } from 'lucide-react'
import { BottomDrawer, DrawerGroup, DrawerItem } from '@/components/ui/bottom-drawer'
import { useToast } from '@/components/layout/toast'
import { useTranslation } from '@/lib/i18n/language-context'
import { saveMediaToDevice, shareMedia, type MediaKind } from '@/lib/save-media'

// Only a mild shade over the viewer: the picture stays almost as bright as it was.
export const MEDIA_DRAWER_BACKDROP = 'rgba(0, 0, 0, 0.3)'

export default function MediaOptionsDrawer({
  open, onClose, url, kind, shareTitle, shareLink, onHeight,
}: {
  open: boolean
  onClose: () => void
  url: string
  kind: MediaKind
  /** Shown by the share sheet next to the file (e.g. the author's name). */
  shareTitle?: string
  /** What to share when the device can't share the file itself (e.g. the post's link). */
  shareLink?: string
  /** Height of the open drawer, so the viewer can lift the picture above it. */
  onHeight?: (px: number) => void
}) {
  const { t } = useTranslation()
  const { success, error: toastError, info } = useToast()

  async function handleSave() {
    onClose()
    info(t('media.saving'), 1500)
    try {
      const result = await saveMediaToDevice(url, kind)
      // 'opened' = handed to the system browser, which shows its own download notification.
      if (result === 'saved') success(t('media.saved'))
    } catch {
      toastError(t('media.save_failed'))
    }
  }

  async function handleShare() {
    onClose()
    try {
      const result = await shareMedia(url, kind, { title: shareTitle, link: shareLink })
      if (result === 'copied') success(t('post.link_copied_clipboard'))
    } catch {
      toastError(t('media.share_failed'))
    }
  }

  return (
    <BottomDrawer open={open} onClose={onClose} label={t('media.options')} backdrop={MEDIA_DRAWER_BACKDROP} onHeight={onHeight}>
      <DrawerGroup>
        <DrawerItem label={t('media.share_via')} icon={<Share size={22} />} onClick={handleShare} />
        <DrawerItem
          label={kind === 'video' ? t('media.save_video') : t('media.save_image')}
          icon={<Download size={22} />}
          onClick={handleSave}
        />
      </DrawerGroup>
    </BottomDrawer>
  )
}
