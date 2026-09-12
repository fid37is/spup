// src/app/(admin)/users/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatNumber, sanitizeFilterTerm } from '@/lib/utils'
import { Users, Search } from 'lucide-react'
import Link from 'next/link'
import AdminUserActions from './user-actions'
import { DataTable, type Column } from '@/components/admin/data-table'
import { AdminPagination } from '@/components/admin/pagination'

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

type UserRow = {
  id: string
  username: string
  display_name: string
  status: string
  role: string
  verification_tier: string
  followers_count: number
  posts_count: number
  bvn_verified: boolean
  is_monetised: boolean
  created_at: string
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

  // Sanitize before building the PostgREST `or()` filter — raw user input
  // here previously let someone inject extra filter clauses via `,`, `(`, `)`.
  if (query) {
    const term = sanitizeFilterTerm(query)
    req = req.or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
  }
  if (status) req = req.eq('status', status)

  const { data, count } = await req
  return { users: (data || []) as UserRow[], total: count || 0 }
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const query  = searchParams.q      || ''
  const status = searchParams.status || ''
  const page   = Number(searchParams.page) || 1

  const { users, total } = await getUsers(query, status, page)
  const totalPages = Math.ceil(total / 20)
  const extraParams = new URLSearchParams({ ...(query && { q: query }), ...(status && { status }) }).toString()

  const columns: Column<UserRow>[] = [
    {
      key: 'user',
      header: 'User',
      render: u => (
        <Link href={`/users/${u.id}`} className="flex min-w-0 items-center gap-3 no-underline">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#1A7A4A] font-display text-[13px] font-extrabold text-white">
            {u.display_name?.slice(0, 2).toUpperCase() || '??'}
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-[13px] font-semibold text-primary">{u.display_name}</div>
            <div className="text-[11px] text-faint">@{u.username}</div>
          </div>
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status / role',
      render: u => (
        <div className="flex flex-col items-start gap-1">
          <span
            className="self-start rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
            style={{ color: STATUS_COLORS[u.status] || '#555', background: `${STATUS_COLORS[u.status] || '#555'}18` }}
          >
            {u.status?.replace(/_/g, ' ').toUpperCase()}
          </span>
          <span className="text-[10px] font-semibold" style={{ color: ROLE_COLORS[u.role] || '#44444A' }}>
            {u.role}
          </span>
        </div>
      ),
    },
    {
      key: 'posts',
      header: 'Posts',
      align: 'right',
      mobileHidden: true,
      render: u => <span className="text-[13px] text-secondary">{formatNumber(u.posts_count || 0)}</span>,
    },
    {
      key: 'followers',
      header: 'Followers',
      align: 'right',
      render: u => <span className="text-[13px] text-secondary">{formatNumber(u.followers_count || 0)}</span>,
    },
    {
      key: 'bvn',
      header: 'BVN',
      align: 'center',
      mobileHidden: true,
      render: u => (
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
          style={{
            color: u.bvn_verified ? '#1A9E5F' : '#44444A',
            background: u.bvn_verified ? '#1A9E5F18' : 'var(--color-surface-3)',
          }}
        >
          {u.bvn_verified ? 'VERIFIED' : 'NO'}
        </span>
      ),
    },
    {
      key: 'monetised',
      header: 'Monetised',
      align: 'center',
      render: u => (
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
          style={{
            color: u.is_monetised ? '#D4A017' : '#44444A',
            background: u.is_monetised ? '#D4A01718' : 'var(--color-surface-3)',
          }}
        >
          {u.is_monetised ? 'YES' : 'NO'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: u => (
        <div className="flex justify-end">
          <AdminUserActions userId={u.id} currentStatus={u.status} currentRole={u.role} />
        </div>
      ),
    },
  ]

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight text-primary sm:text-[26px]">
          Users
        </h1>
        <p className="text-sm text-faint">
          {formatNumber(total)} total{status ? ` · filtered by ${status}` : ''}
        </p>
      </div>

      {/* Filters */}
      <form method="GET" className="mb-5 flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1 sm:max-w-[360px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search by name or username…"
            className="w-full rounded-[9px] border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-primary outline-none"
          />
        </div>
        <div className="flex gap-2.5">
          <select
            name="status"
            defaultValue={status}
            className="flex-1 rounded-[9px] border border-border bg-surface px-3 py-2.5 text-sm text-primary outline-none sm:flex-none"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
            <option value="pending_verification">Pending verification</option>
          </select>
          <button
            type="submit"
            className="rounded-[9px] bg-brand px-4 py-2.5 text-sm font-bold text-white"
          >
            Filter
          </button>
          {(query || status) && (
            <Link
              href="/users"
              className="flex items-center rounded-[9px] bg-[color:var(--color-surface-3)] px-3.5 py-2.5 text-sm text-secondary no-underline"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {users.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-5 py-12 text-center">
          <Users size={28} className="mx-auto mb-2.5 text-[#2A2A32]" />
          <p className="text-sm text-faint">No users found</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={users} keyField="id" />
      )}

      <AdminPagination page={page} totalPages={totalPages} basePath="/users" extraParams={extraParams} />
    </div>
  )
}
