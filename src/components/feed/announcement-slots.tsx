'use client'

// src/components/feed/announcement-slots.tsx
//
// The three places an announcement can appear, each reading the one announcement
// held by the provider (components/layout/announcement-provider.tsx):
//
//   FeedAnnouncementBanner  features, in the feed under the tabs   (phones + tablets)
//   FeedAnnouncementStrip   maintenance, pinned under the tabs     (phones + tablets)
//   SidebarAnnouncementCard either kind, top of the right column   (desktop, >1100px)
//
// "Phones + tablets" is enforced with the .announcement-in-feed class, hidden above
// 1100px in the (main) layout's stylesheet - the same width at which the right column
// appears - so exactly one of the two is ever visible.

import { useAnnouncement } from '@/components/layout/announcement-provider'
import AnnouncementBanner from './announcement-banner'
import AnnouncementStrip from './announcement-strip'

export function FeedAnnouncementBanner() {
  const { announcement, dismiss } = useAnnouncement()
  if (!announcement || announcement.kind !== 'feature') return null
  return (
    <div className="announcement-in-feed">
      <AnnouncementBanner announcement={announcement} onDismiss={() => dismiss(announcement.id)} />
    </div>
  )
}

export function FeedAnnouncementStrip() {
  const { announcement, dismiss } = useAnnouncement()
  if (!announcement || announcement.kind !== 'maintenance') return null
  return (
    <div className="announcement-in-feed">
      <AnnouncementStrip announcement={announcement} onDismiss={() => dismiss(announcement.id)} />
    </div>
  )
}

export function SidebarAnnouncementCard() {
  const { announcement, dismiss } = useAnnouncement()
  if (!announcement) return null
  return <AnnouncementBanner variant="sidebar" announcement={announcement} onDismiss={() => dismiss(announcement.id)} />
}
