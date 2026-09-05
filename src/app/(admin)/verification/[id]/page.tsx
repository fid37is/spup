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
    <div style={{ padding: '28px 32px', maxWidth: 780 }}>
      <Link href="/verification" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6A6A60', textDecoration: 'none', fontSize: 13, marginBottom: 20 }}>
        <ArrowLeft size={14} /> Back to verification
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em' }}>
            Verification request
          </h1>
          <p style={{ fontSize: 13, color: '#44444A', marginTop: 2 }}>
            Requesting <span style={{ color: '#378ADD', fontWeight: 700, textTransform: 'capitalize' }}>{request.requested_tier}</span> status
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StatusBadge status={request.status} />
          {request.status === 'pending' && <VerificationActions requestId={request.id} />}
        </div>
      </div>

      {/* User card */}
      <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            background: '#1E1E26', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Syne', sans-serif", fontWeight: 700, color: '#6A6A60', fontSize: 20,
          }}>
            {user?.display_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#F0F0EC', fontFamily: "'Syne', sans-serif" }}>{user?.display_name}</span>
              {user?.bvn_verified && (
                <span style={{ fontSize: 11, background: 'rgba(26,158,95,0.12)', color: '#1A9E5F', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>BVN ✓</span>
              )}
            </div>
            <Link href={`/users/${user?.id}`} style={{ fontSize: 13, color: '#44444A', textDecoration: 'none' }}>@{user?.username}</Link>
            {user?.bio && <p style={{ fontSize: 13, color: '#8A8A85', marginTop: 8, lineHeight: 1.5 }}>{user.bio}</p>}
            <p style={{ fontSize: 12, color: '#44444A', marginTop: 8 }}>
              Joined {user?.created_at ? formatRelativeTime(user.created_at) : '—'} · Currently <span style={{ textTransform: 'capitalize' }}>{user?.verification_tier || 'none'}</span> tier
            </p>
          </div>
        </div>
      </div>

      {/* Account stats — context for the review decision */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon={BadgeCheck} label="Followers" value={formatNumber(user?.followers_count || 0)} color="#378ADD" />
        <StatCard icon={BadgeCheck} label="Following" value={formatNumber(user?.following_count || 0)} />
        <StatCard icon={BadgeCheck} label="Posts" value={formatNumber(user?.posts_count || 0)} />
      </div>

      {/* Submitted note */}
      <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#44444A', marginBottom: 10 }}>USER&apos;S SUBMITTED NOTE</div>
        <p style={{ fontSize: 13, color: request.note ? '#D0D0C8' : '#44444A', lineHeight: 1.5 }}>
          {request.note || 'No note was submitted with this request.'}
        </p>
        <p style={{ fontSize: 12, color: '#44444A', marginTop: 10 }}>Submitted {formatRelativeTime(request.created_at)}</p>
      </div>

      {/* Review outcome, if reviewed */}
      {request.status !== 'pending' && (
        <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#44444A', marginBottom: 10 }}>REVIEW OUTCOME</div>
          <p style={{ fontSize: 13, color: '#D0D0C8' }}>
            {request.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
            <span style={{ fontWeight: 600, color: '#F0F0EC' }}>{request.reviewer?.display_name || 'an admin'}</span>
            {request.reviewed_at && ` · ${formatRelativeTime(request.reviewed_at)}`}
          </p>
          {request.review_notes && (
            <p style={{ fontSize: 13, color: '#8A8A85', marginTop: 8 }}>&ldquo;{request.review_notes}&rdquo;</p>
          )}
        </div>
      )}
    </div>
  )
}