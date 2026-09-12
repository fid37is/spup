// src/app/(admin)/verification/[id]/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatNumber, formatRelativeTime } from '@/lib/utils'
import { ArrowLeft, BadgeCheck } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StatusBadge } from '@/components/admin/status-badge'
import { StatCard } from '@/components/admin/stat-card'
import VerificationActions from '../verification-actions'

interface RequestDetail {
  id: string
  requested_tier: string
  note: string | null
  status: string
  review_notes: string | null
  created_at: string
  reviewed_at: string | null
  user: {
    id: string
    username: string
    display_name: string
    bio: string | null
    avatar_url: string | null
    verification_tier: string
    bvn_verified: boolean
    followers_count: number
    following_count: number
    posts_count: number
    created_at: string
  } | null
  reviewer: { username: string; display_name: string } | null
}

async function getRequest(id: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('verification_requests')
    .select(`
      id, requested_tier, note, status, review_notes, created_at, reviewed_at,
      user:users!verification_requests_user_id_fkey(
        id, username, display_name, bio, avatar_url, verification_tier,
        bvn_verified, followers_count, following_count, posts_count, created_at
      ),
      reviewer:users!verification_requests_reviewed_by_fkey(username, display_name)
    `)
    .eq('id', id)
    .single()

  return data as unknown as RequestDetail | null
}

export default async function VerificationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const request = await getRequest(id)
  if (!request) notFound()

  const user = request.user

  return (
    <div className="mx-auto max-w-[780px] px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <Link href="/verification" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-faint no-underline">
        <ArrowLeft size={14} /> Back to verification
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">
            Verification request
          </h1>
          <p className="mt-0.5 text-[13px] text-faint">
            Requesting <span className="font-bold capitalize text-[#378ADD]">{request.requested_tier}</span> status
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={request.status} />
          {request.status === 'pending' && <VerificationActions requestId={request.id} />}
        </div>
      </div>

      {/* User card */}
      <div className="mb-5 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[color:var(--color-surface-3)] font-display text-xl font-bold text-secondary sm:h-[52px] sm:w-[52px]">
            {user?.display_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-base font-bold text-primary">{user?.display_name}</span>
              {user?.bvn_verified && (
                <span className="rounded-md bg-brand-muted px-2 py-0.5 text-[11px] font-semibold text-brand">BVN ✓</span>
              )}
            </div>
            <Link href={`/users/${user?.id}`} className="text-[13px] text-faint no-underline">@{user?.username}</Link>
            {user?.bio && <p className="mt-2 text-[13px] leading-relaxed text-secondary">{user.bio}</p>}
            <p className="mt-2 text-xs text-faint">
              Joined {user?.created_at ? formatRelativeTime(user.created_at) : '—'} · Currently <span className="capitalize">{user?.verification_tier || 'none'}</span> tier
            </p>
          </div>
        </div>
      </div>

      {/* Account stats — context for the review decision */}
      <div className="mb-5 grid grid-cols-3 gap-2.5 sm:gap-3.5">
        <StatCard icon={BadgeCheck} label="Followers" value={formatNumber(user?.followers_count || 0)} color="#378ADD" />
        <StatCard icon={BadgeCheck} label="Following" value={formatNumber(user?.following_count || 0)} />
        <StatCard icon={BadgeCheck} label="Posts" value={formatNumber(user?.posts_count || 0)} />
      </div>

      {/* Submitted note */}
      <div className="mb-5 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-2.5 text-[11px] font-bold tracking-wide text-faint">USER&apos;S SUBMITTED NOTE</div>
        <p className={`text-[13px] leading-relaxed ${request.note ? 'text-[#D0D0C8]' : 'text-faint'}`}>
          {request.note || 'No note was submitted with this request.'}
        </p>
        <p className="mt-2.5 text-xs text-faint">Submitted {formatRelativeTime(request.created_at)}</p>
      </div>

      {/* Review outcome, if reviewed */}
      {request.status !== 'pending' && (
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="mb-2.5 text-[11px] font-bold tracking-wide text-faint">REVIEW OUTCOME</div>
          <p className="text-[13px] text-[#D0D0C8]">
            {request.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
            <span className="font-semibold text-primary">{request.reviewer?.display_name || 'an admin'}</span>
            {request.reviewed_at && ` · ${formatRelativeTime(request.reviewed_at)}`}
          </p>
          {request.review_notes && (
            <p className="mt-2 text-[13px] text-secondary">&ldquo;{request.review_notes}&rdquo;</p>
          )}
        </div>
      )}
    </div>
  )
}
