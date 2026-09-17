// src/app/(main)/explore/people/page.tsx
//
// "Who to follow" — the dedicated page behind Explore's "See all" link.
// Lets people browse suggested accounts filtered by category, instead of
// the 5-account teaser embedded in the sidebar / Explore tab.

import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { getSuggestedUsers, getSuggestedUsersByCategory, ACCOUNT_CATEGORIES } from '@/lib/queries/users'
import { UserCard, type UserResult } from '@/components/explore/user-card'

interface SP { category?: string }

const CATEGORIES = ['All', ...ACCOUNT_CATEGORIES]

function CategoryChips({ active }: { active: string }) {
  return (
    <div style={{
      display: 'flex', gap: 8, padding: '12px 20px', overflowX: 'auto',
      borderBottom: '1px solid var(--color-border)',
      scrollbarWidth: 'none', msOverflowStyle: 'none',
    }}>
      {CATEGORIES.map(cat => {
        const isActive = active === cat
        const href = cat === 'All' ? '/explore/people' : `/explore/people?category=${encodeURIComponent(cat)}`
        return (
          <Link
            key={cat}
            href={href}
            style={{
              flexShrink: 0, padding: '7px 16px', borderRadius: 20, textDecoration: 'none',
              fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              background: isActive ? 'var(--color-brand)' : 'var(--color-surface-2)',
              color: isActive ? 'white' : 'var(--color-text-secondary)',
              border: `1px solid ${isActive ? 'var(--color-brand)' : 'var(--color-border)'}`,
            }}
          >
            {cat}
          </Link>
        )
      })}
    </div>
  )
}

export default async function WhoToFollowPage({ searchParams }: { searchParams: Promise<SP> }) {
  const params   = await searchParams
  const category = params.category && ACCOUNT_CATEGORIES.includes(params.category) ? params.category : 'All'

  const admin = createAdminClient()
  const { data: { user: authUser } } = await admin.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: viewer } = await admin.from('users').select('id').eq('auth_id', authUser.id).single()
  if (!viewer) redirect('/login')

  const [{ data: followingRows }, { data: followerRows }] = await Promise.all([
    admin.from('follows').select('following_id').eq('follower_id', viewer.id),
    admin.from('follows').select('follower_id').eq('following_id', viewer.id),
  ])
  const followingIds = (followingRows || []).map((r: any) => r.following_id as string)
  const followerIdSet = new Set((followerRows || []).map((r: any) => r.follower_id as string))
  const excludeIds = [viewer.id, ...followingIds]

  const suggested: UserResult[] = category === 'All'
    ? await getSuggestedUsers(excludeIds, 30) as UserResult[]
    : await getSuggestedUsersByCategory(category, excludeIds, 30) as UserResult[]

  return (
    <div>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', height: 56 }}>
          <Link
            href="/explore"
            aria-label="Back"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: '50%',
              color: 'var(--color-text-primary)', textDecoration: 'none', flexShrink: 0,
            }}
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17,
            color: 'var(--color-text-primary)', margin: 0,
          }}>
            Who to follow
          </h1>
        </div>
        <CategoryChips active={category} />
      </div>

      {suggested.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={22} color="var(--color-text-muted)" />
            </div>
          </div>
          <h3 style={{ fontWeight: 700, fontSize: 17, color: 'var(--color-text-primary)', marginBottom: 8 }}>
            {category === 'All' ? 'No suggestions yet' : `No ${category} accounts yet`}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 260, margin: '0 auto' }}>
            {category === 'All'
              ? 'Check back once more people have joined.'
              : `Nobody's posted under ${category} topics yet — try a different category.`}
          </p>
        </div>
      ) : (
        suggested.map(u => (
          <UserCard
            key={u.id}
            u={u}
            showFollow
            initialFollowing={false}
            followsMe={followerIdSet.has(u.id)}
          />
        ))
      )}
    </div>
  )
}