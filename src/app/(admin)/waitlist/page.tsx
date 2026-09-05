// src/app/(admin)/admin/waitlist/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'
import WaitlistInviteButton from './invite-button'

interface SearchParams { status?: string }

async function getWaitlist(params: SearchParams) {
  const admin = createAdminClient()
  const status = params.status || 'waiting'

  const { data, count } = await admin
    .from('waitlist')
    .select('id, full_name, phone, email, referrer, position, status, created_at, invited_at', { count: 'exact' })
    .eq('status', status)
    .order('position', { ascending: true })
    .limit(100)

  return { entries: data || [], total: count || 0 }
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
  const [{ entries, total }, counts] = await Promise.all([getWaitlist(params), getWaitlistCounts()])
  const activeStatus = params.status || 'waiting'

  const TABS = [
    { key: 'waiting',  label: 'Waiting',  count: counts.waiting },
    { key: 'invited',  label: 'Invited',  count: counts.invited },
    { key: 'joined',   label: 'Joined',   count: counts.joined },
  ]

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em' }}>Waitlist</h1>
        <p style={{ fontSize: 14, color: '#44444A', marginTop: 2 }}>
          {counts.waiting + counts.invited + counts.joined} total signups
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Waiting', value: counts.waiting, color: '#D4A017' },
          { label: 'Invited', value: counts.invited, color: '#378ADD' },
          { label: 'Joined',  value: counts.joined,  color: '#1A9E5F' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 12, color: '#44444A', marginBottom: 6, letterSpacing: '0.04em' }}>{s.label.toUpperCase()}</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 30, color: s.color }}>{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #1E1E26' }}>
        {TABS.map(tab => (
          <a key={tab.key} href={`?status=${tab.key}`} style={{
            padding: '10px 18px', textDecoration: 'none', fontSize: 14,
            fontFamily: "'Syne', sans-serif", fontWeight: 600,
            color: activeStatus === tab.key ? '#F0F0EC' : '#44444A',
            borderBottom: activeStatus === tab.key ? '2px solid #1A9E5F' : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            {tab.label}
            <span style={{ background: '#1E1E26', color: '#6A6A60', fontSize: 11, fontWeight: 700, borderRadius: 8, padding: '1px 6px' }}>
              {tab.count}
            </span>
          </a>
        ))}
      </div>

      <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1E1E26', background: '#0A0A0F' }}>
              {['#', 'Name', 'Contact', 'Referrer', 'Signed up', 'Actions'].map(h => (
                <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#44444A', textAlign: 'left', letterSpacing: '0.06em' }}>
                  {h.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e: any, i: number) => (
              <tr key={e.id} style={{ borderBottom: i < entries.length - 1 ? '1px solid #141418' : 'none' }}>
                <td style={{ padding: '12px 16px', fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: '#44444A' }}>
                  #{e.position}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#F0F0EC', fontFamily: "'Syne', sans-serif" }}>
                  {e.full_name}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 13, color: '#8A8A85' }}>{e.phone || e.email || '—'}</div>
                  {e.phone && e.email && <div style={{ fontSize: 11, color: '#44444A' }}>{e.email}</div>}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#44444A' }}>
                  {e.referrer || '—'}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#44444A' }}>
                  {formatRelativeTime(e.created_at)}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {e.status === 'waiting' && <WaitlistInviteButton waitlistId={e.id} name={e.full_name} />}
                  {e.status === 'invited' && <span style={{ fontSize: 12, color: '#378ADD' }}>Invited {e.invited_at ? formatRelativeTime(e.invited_at) : ''}</span>}
                  {e.status === 'joined' && <span style={{ fontSize: 12, color: '#1A9E5F' }}>✓ Joined</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {entries.length === 0 && (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#44444A' }}>No {activeStatus} entries</p>
          </div>
        )}
      </div>
    </div>
  )
}