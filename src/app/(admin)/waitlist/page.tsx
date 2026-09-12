// src/app/(admin)/waitlist/page.tsx
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'
import WaitlistInviteButton from './invite-button'
import { DataTable, type Column } from '@/components/admin/data-table'

interface SearchParams { status?: string }

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

async function getWaitlist(params: SearchParams) {
  const admin = createAdminClient()
  const status = params.status || 'waiting'

  const { data, count } = await admin
    .from('waitlist')
    .select('id, full_name, phone, email, referrer, position, status, created_at, invited_at', { count: 'exact' })
    .eq('status', status)
    .order('position', { ascending: true })
    .limit(100)

  return { entries: (data || []) as WaitlistRow[], total: count || 0 }
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
  const [{ entries }, counts] = await Promise.all([getWaitlist(params), getWaitlistCounts()])
  const activeStatus = params.status || 'waiting'

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
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Waitlist</h1>
        <p className="mt-0.5 text-sm text-faint">{counts.waiting + counts.invited + counts.joined} total signups</p>
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
    </div>
  )
}
