// src/app/(admin)/users/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatNumber } from '@/lib/utils'
import { Users, Search } from 'lucide-react'
import AdminUserActions from './user-actions'

const STATUS_COLORS: Record<string, string> = {
  active:               '#1A9E5F',
  suspended:            '#D4A017',
  banned:               '#E53935',
  pending_verification: '#378ADD',
}

const ROLE_COLORS: Record<string, string> = {
  admin:     '#D4A017',
  moderator: '#378ADD',
  user:      '#44444A',
}

interface PageProps {
  searchParams: { q?: string; status?: string; page?: string }
}

async function getUsers(query: string, status: string, page: number) {
  const admin  = createAdminClient()
  const limit  = 20
  const offset = (page - 1) * limit

  let req = admin
    .from('users')
    .select(
      'id, username, display_name, status, role, verification_tier, followers_count, posts_count, bvn_verified, is_monetised, created_at',
      { count: 'exact' }
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (query)  req = req.or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
  if (status) req = req.eq('status', status)

  const { data, count } = await req
  return { users: data || [], total: count || 0 }
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const query  = searchParams.q      || ''
  const status = searchParams.status || ''
  const page   = Number(searchParams.page) || 1

  const { users, total } = await getUsers(query, status, page)
  const totalPages = Math.ceil(total / 20)

  return (
    <div style={{ padding: '28px 32px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 26, color: '#F0F0EC', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Users
        </h1>
        <p style={{ fontSize: 14, color: '#44444A' }}>
          {formatNumber(total)} total{status ? ` · filtered by ${status}` : ''}
        </p>
      </div>

      {/* Filters */}
      <form method="GET" style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={14} color="#44444A" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search by name or username…"
            style={{
              width: '100%', background: '#0D0D12', border: '1px solid #1E1E26',
              borderRadius: 9, padding: '9px 12px 9px 34px', fontSize: 13,
              color: '#F0F0EC', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <select
          name="status"
          defaultValue={status}
          style={{
            background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 9,
            padding: '9px 12px', fontSize: 13, color: status ? '#F0F0EC' : '#44444A',
            outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
          <option value="pending_verification">Pending verification</option>
        </select>
        <button
          type="submit"
          style={{
            background: '#1A9E5F', border: 'none', borderRadius: 9,
            padding: '9px 18px', fontSize: 13, fontWeight: 700,
            color: '#fff', cursor: 'pointer',
          }}
        >
          Filter
        </button>
        {(query || status) && (
          <a
            href="/users"
            style={{
              background: '#1E1E26', borderRadius: 9, padding: '9px 14px',
              fontSize: 13, color: '#A0A09A', textDecoration: 'none',
              display: 'flex', alignItems: 'center',
            }}
          >
            Clear
          </a>
        )}
      </form>

      {/* Table */}
      <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 16, overflow: 'hidden' }}>

        {/* Head */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 80px 80px 90px 90px 44px',
          padding: '10px 20px',
          borderBottom: '1px solid #1A1A20',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#44444A',
        }}>
          <span>USER</span>
          <span>STATUS / ROLE</span>
          <span style={{ textAlign: 'right' }}>POSTS</span>
          <span style={{ textAlign: 'right' }}>FOLLOWERS</span>
          <span style={{ textAlign: 'center' }}>BVN</span>
          <span style={{ textAlign: 'center' }}>MONETISED</span>
          <span />
        </div>

        {users.length === 0 && (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <Users size={28} color="#2A2A32" style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 14, color: '#44444A' }}>No users found</p>
          </div>
        )}

        {users.map((u: any, i: number) => (
          <div
            key={u.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 80px 80px 90px 90px 44px',
              alignItems: 'center',
              padding: '14px 20px',
              borderBottom: i < users.length - 1 ? '1px solid #141418' : 'none',
            }}
          >
            {/* User */}
            <a
              href={`/users/${u.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, textDecoration: 'none' }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: '#1A7A4A', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontFamily: "'Syne', sans-serif",
                fontWeight: 800, fontSize: 13, color: 'white',
              }}>
                {u.display_name?.slice(0, 2).toUpperCase() || '??'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: '#F0F0EC',
                  fontFamily: "'Syne', sans-serif",
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {u.display_name}
                </div>
                <div style={{ fontSize: 11, color: '#44444A' }}>@{u.username}</div>
              </div>
            </a>

            {/* Status / Role */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                color: STATUS_COLORS[u.status] || '#555',
                background: `${STATUS_COLORS[u.status] || '#555'}18`,
                padding: '2px 7px', borderRadius: 4, alignSelf: 'flex-start',
              }}>
                {u.status?.replace(/_/g, ' ').toUpperCase()}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: ROLE_COLORS[u.role] || '#44444A' }}>
                {u.role}
              </span>
            </div>

            {/* Posts */}
            <div style={{ fontSize: 13, color: '#A0A09A', textAlign: 'right' }}>
              {formatNumber(u.posts_count || 0)}
            </div>

            {/* Followers */}
            <div style={{ fontSize: 13, color: '#A0A09A', textAlign: 'right' }}>
              {formatNumber(u.followers_count || 0)}
            </div>

            {/* BVN */}
            <div style={{ textAlign: 'center' }}>
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: u.bvn_verified ? '#1A9E5F' : '#44444A',
                background: u.bvn_verified ? '#1A9E5F18' : '#1E1E26',
                padding: '2px 7px', borderRadius: 4,
              }}>
                {u.bvn_verified ? 'VERIFIED' : 'NO'}
              </span>
            </div>

            {/* Monetised */}
            <div style={{ textAlign: 'center' }}>
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: u.is_monetised ? '#D4A017' : '#44444A',
                background: u.is_monetised ? '#D4A01718' : '#1E1E26',
                padding: '2px 7px', borderRadius: 4,
              }}>
                {u.is_monetised ? 'YES' : 'NO'}
              </span>
            </div>

            {/* Actions — reuses existing AdminUserActions dropdown */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <AdminUserActions
                userId={u.id}
                currentStatus={u.status}
                currentRole={u.role}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <span style={{ fontSize: 13, color: '#44444A' }}>Page {page} of {totalPages}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {page > 1 && (
              <a
                href={`/users?q=${query}&status=${status}&page=${page - 1}`}
                style={{ background: '#1E1E26', borderRadius: 9, padding: '8px 16px', fontSize: 13, color: '#F0F0EC', textDecoration: 'none' }}
              >
                ← Prev
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/users?q=${query}&status=${status}&page=${page + 1}`}
                style={{ background: '#1E1E26', borderRadius: 9, padding: '8px 16px', fontSize: 13, color: '#F0F0EC', textDecoration: 'none' }}
              >
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}