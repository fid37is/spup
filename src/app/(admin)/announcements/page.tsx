// src/app/(admin)/announcements/page.tsx
//
// Banners shown at the top of the feed: new features, maintenance heads-ups.
// Same shape as the other (admin) routes: server-fetch with createAdminClient,
// render with the shared DataTable/StatusBadge.

import { createAdminClient } from '@/lib/supabase/server'
import { Megaphone } from 'lucide-react'
import { formatNumber } from '@/lib/utils'
import { StatCard } from '@/components/admin/stat-card'
import { StatusBadge } from '@/components/admin/status-badge'
import { DataTable, type Column } from '@/components/admin/data-table'
import { KIND_LABELS, type AnnouncementKind } from '@/lib/announcements'
import { CreateAnnouncementForm, EndAnnouncementButton } from './announcements-client'

export const metadata = { title: 'Announcements' }

interface AnnouncementRow {
  id: string
  kind: AnnouncementKind
  title: string
  body: string
  cta_label: string | null
  starts_at: string
  ends_at: string | null
  remind_after_hours: number | null
  is_active: boolean
  created_at: string
  creator: { username: string } | null
}

type RowState = 'live' | 'scheduled' | 'ended'

function rowState(r: AnnouncementRow): RowState {
  const now = Date.now()
  if (!r.is_active) return 'ended'
  if (r.ends_at && new Date(r.ends_at).getTime() <= now) return 'ended'
  if (new Date(r.starts_at).getTime() > now) return 'scheduled'
  return 'live'
}

// Lagos time: this is what the admin is thinking in when they schedule a window.
function when(iso: string) {
  return new Date(iso).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

async function getAnnouncements() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('announcements')
    .select(`
      id, kind, title, body, cta_label, starts_at, ends_at, remind_after_hours, is_active, created_at,
      creator:users!announcements_created_by_fkey(username)
    `)
    .order('created_at', { ascending: false })
    .limit(100)
  return (data || []) as unknown as AnnouncementRow[]
}

export default async function AdminAnnouncementsPage() {
  const rows = await getAnnouncements()
  const liveCount = rows.filter(r => rowState(r) === 'live').length

  const columns: Column<AnnouncementRow>[] = [
    {
      key: 'title', header: 'Announcement', width: '38%',
      render: r => (
        <div>
          <div className="text-[13px] font-semibold text-primary">{r.title}</div>
          <div className="mt-0.5 max-w-[360px] truncate text-xs text-faint">{r.body}</div>
        </div>
      ),
    },
    { key: 'kind', header: 'Type', mobileHidden: true, render: r => <span className="text-[13px] text-secondary">{KIND_LABELS[r.kind]}</span> },
    {
      key: 'window', header: 'Shows', mobileHidden: true,
      render: r => (
        <div className="text-xs text-faint">
          <div>{when(r.starts_at)} → {r.ends_at ? when(r.ends_at) : 'until ended'}</div>
          {r.remind_after_hours && <div className="mt-0.5">Comes back {r.remind_after_hours}h after dismissal</div>}
        </div>
      ),
    },
    { key: 'by', header: 'Created by', mobileHidden: true, render: r => <span className="text-xs text-faint">{r.creator ? `@${r.creator.username}` : '—'}</span> },
    {
      key: 'status', header: 'Status',
      render: r => {
        const s = rowState(r)
        return <StatusBadge status={s === 'live' ? 'active' : s === 'scheduled' ? 'pending' : 'ended'} label={s} />
      },
    },
    {
      key: 'actions', header: '', align: 'right',
      render: r => rowState(r) !== 'ended' ? <EndAnnouncementButton id={r.id} /> : null,
    },
  ]

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Announcements</h1>
        <p className="mt-0.5 text-sm text-faint">A banner at the top of everyone&rsquo;s feed - new features, maintenance heads-ups</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3.5">
        <StatCard icon={Megaphone} label="Live now" value={formatNumber(liveCount)} />
      </div>

      <CreateAnnouncementForm />

      <DataTable
        columns={columns}
        rows={rows}
        keyField="id"
        emptyMessage="No announcements yet"
      />
    </div>
  )
}
