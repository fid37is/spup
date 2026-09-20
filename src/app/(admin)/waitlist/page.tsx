// src/app/(admin)/waitlist/page.tsx
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'
import WaitlistInviteButton from './invite-button'
import BulkInvitePanel from './bulk-invite-panel'
import { DataTable, type Column } from '@/components/admin/data-table'
import { AdminPagination } from '@/components/admin/pagination'
import { ExportButton } from '@/components/admin/export-button'
import { getWaitlistOpenStatus } from '@/lib/queries/settings'

const PAGE_SIZE = 25
const STATUSES = ['waiting', 'invited', 'joined'] as const
type WaitlistStatus = (typeof STATUSES)[number]

interface SearchParams { status?: string; page?: string }

// Anything unrecognised falls back to the default tab rather than querying a status that can't exist.
function parseStatus(raw?: string): WaitlistStatus {
  return (STATUSES as readonly string[]).includes(raw ?? '') ? (raw as WaitlistStatus) : 'waiting'
}

function parsePage(raw?: string): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n >= 1 ? n : 1
}

type WaitlistRow = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  referrer: string | null
  position: number
  status: string
  created_at: string
  invited_at: string | null
}

// Newest signups first. `position` breaks ties for entries created in the same
// instant, so page boundaries stay stable while people keep joining.
async function getWaitlist(status: WaitlistStatus, page: number) {
  const admin = createAdminClient()
  const from = (page - 1) * PAGE_SIZE

  const { data } = await admin
    .from('waitlist')
    .select('id, full_name, phone, email, referrer, position, status, created_at, invited_at')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .order('position', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  return (data || []) as WaitlistRow[]
}

async function getWaitlistCounts() {
  const admin = createAdminClient()
  const [{ count: waiting }, { count: invited }, { count: joined }] = await Promise.all([
    admin.from('waitlist').select('id', { count: 'exact', head: true }).eq('status', 'waiting'),
    admin.from('waitlist').select('id', { count: 'exact', head: true }).eq('status', 'invited'),
    admin.from('waitlist').select('id', { count: 'exact', head: true }).eq('status', 'joined'),
  ])
  return { waiting: waiting || 0, invited: invited || 0, joined: joined || 0 }
}

export default async function AdminWaitlistPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const activeStatus = parseStatus(params.status)

  const [counts, waitlistOpen] = await Promise.all([getWaitlistCounts(), getWaitlistOpenStatus()])

  // The tab's total comes from the counts, so an out-of-range ?page= (e.g. a
  // stale bookmark after invites shrank the list) clamps to the last page
  // instead of asking Postgres for rows past the end.
  const activeTotal = counts[activeStatus]
  const totalPages = Math.max(1, Math.ceil(activeTotal / PAGE_SIZE))
  const page = Math.min(parsePage(params.page), totalPages)
  const entries = await getWaitlist(activeStatus, page)
  const firstShown = activeTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const lastShown = (page - 1) * PAGE_SIZE + entries.length

  const TABS = [
    { key: 'waiting',  label: 'Waiting',  count: counts.waiting },
    { key: 'invited',  label: 'Invited',  count: counts.invited },
    { key: 'joined',   label: 'Joined',   count: counts.joined },
  ]

  const columns: Column<WaitlistRow>[] = [
    {
      key: 'name', header: 'Name',
      render: e => (
        <div>
          <div className="font-display text-[13px] font-semibold text-primary">{e.full_name}</div>
          <div className="text-xs text-faint">#{e.position}</div>
        </div>
      ),
    },
    {
      key: 'contact', header: 'Contact', mobileHidden: true,
      render: e => (
        <div>
          <div className="text-[13px] text-secondary">{e.phone || e.email || '—'}</div>
          {e.phone && e.email && <div className="text-[11px] text-faint">{e.email}</div>}
        </div>
      ),
    },
    { key: 'referrer', header: 'Referrer', mobileHidden: true, render: e => <span className="text-xs text-faint">{e.referrer || '—'}</span> },
    { key: 'signed_up', header: 'Signed up', mobileHidden: true, render: e => <span className="text-xs text-faint">{formatRelativeTime(e.created_at)}</span> },
    {
      key: 'actions', header: 'Actions', align: 'right',
      render: e => (
        <>
          {e.status === 'waiting' && <WaitlistInviteButton waitlistId={e.id} name={e.full_name} />}
          {e.status === 'invited' && <span className="text-xs text-[#378ADD]">Invited {e.invited_at ? formatRelativeTime(e.invited_at) : ''}</span>}
          {e.status === 'joined' && <span className="text-xs text-brand">✓ Joined</span>}
        </>
      ),
    },
  ]

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Waitlist</h1>
          <p className="mt-0.5 text-sm text-faint">{counts.waiting + counts.invited + counts.joined} total signups</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <ExportButton href={`/api/admin/export/waitlist?status=${activeStatus}`} label={`Export ${activeStatus} emails`} />
          <ExportButton href="/api/admin/export/waitlist?status=all" label="Export all emails" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-3 gap-2.5 sm:gap-3.5">
        {[
          { label: 'Waiting', value: counts.waiting, color: '#D4A017' },
          { label: 'Invited', value: counts.invited, color: '#378ADD' },
          { label: 'Joined',  value: counts.joined,  color: '#1A9E5F' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-surface px-3.5 py-3.5 sm:px-5">
            <div className="mb-1.5 text-[11px] tracking-wide text-faint sm:text-xs">{s.label.toUpperCase()}</div>
            <div className="font-display text-xl font-extrabold sm:text-[30px]" style={{ color: s.color }}>{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <BulkInvitePanel waitingCount={counts.waiting} waitlistOpen={waitlistOpen} />

      {/* Tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(tab => (
          <Link
            key={tab.key}
            href={`?status=${tab.key}`}
            className="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 font-display text-sm font-semibold no-underline"
            style={{
              color: activeStatus === tab.key ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
              borderBottomColor: activeStatus === tab.key ? 'var(--color-brand)' : 'transparent',
            }}
          >
            {tab.label}
            <span className="rounded-lg bg-[color:var(--color-surface-3)] px-1.5 py-0.5 text-[11px] font-bold text-secondary">
              {tab.count}
            </span>
          </Link>
        ))}
      </div>

      <DataTable columns={columns} rows={entries} keyField="id" emptyMessage={`No ${activeStatus} entries`} />

      {activeTotal > 0 && (
        <p className="mt-3 text-center text-xs text-faint">
          Showing {firstShown}–{lastShown} of {activeTotal.toLocaleString()} · newest first
        </p>
      )}

      <AdminPagination page={page} totalPages={totalPages} basePath="/waitlist" extraParams={`status=${activeStatus}`} />
    </div>
  )
}