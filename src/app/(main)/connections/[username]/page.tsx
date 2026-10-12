// src/app/(main)/connections/[username]/page.tsx
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import BackButton from '@/components/ui/back-button'
import ConnectionsClient from './connections-client'
import { getBlockState } from '@/lib/mutuals'
import type { Metadata } from 'next'

type Tab = 'following' | 'followers' | 'mutuals'

const VALID_TABS: Tab[] = ['following', 'followers', 'mutuals']

const USER_FIELDS = 'id, username, display_name, avatar_url, verification_tier, is_monetised, followers_count, bio'

interface PageProps {
  params: Promise<{ username: string }>
  searchParams: Promise<{ tab?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  return {
    title: `${username}'s connections — Spup`,
    robots: { index: false, follow: false },
  }
}

export default async function ConnectionsPage({ params, searchParams }: PageProps) {
  const { username } = await params
  const sp = await searchParams
  const rawTab = sp?.tab ?? 'following'
  const activeTab: Tab = VALID_TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'following'

  // Auth check — viewer must be logged in
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  // Use admin client for all data reads — bypasses RLS completely,
  // safe here because this is a read-only server component.
  const admin = createAdminClient()

  // Resolve the profile by username
  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('id, display_name, username')
    .eq('username', username)
    .is('deleted_at', null)
    .maybeSingle()

  if (!profile) notFound()

  // Viewer identity for back link
  const { data: viewer } = await admin
    .from('users').select('id').eq('auth_id', authUser.id).single()

  const isOwn = viewer?.id === profile.id

  // Someone who blocked this viewer: send them to the profile page, which
  // shows the "You're blocked" screen, instead of exposing the follow lists.
  if (viewer && !isOwn) {
    const block = await getBlockState(viewer.id, profile.id)
    if (block.byThem) redirect(`/user/${username}`)
  }
  const backHref = isOwn ? '/profile' : `/user/${username}`

  // Fetch viewer's own follow state (who the logged-in user follows / is followed by)
  // so we can show correct Follow / Follow back / Unfollow buttons
  const [{ data: viewerFollowingRels }, { data: viewerFollowerRels }] = viewer
    ? await Promise.all([
      admin.from('follows').select('following_id').eq('follower_id', viewer.id),
      admin.from('follows').select('follower_id').eq('following_id', viewer.id),
    ])
    : [{ data: [] }, { data: [] }]

  const viewerFollowingIds = (viewerFollowingRels || []).map((r: any) => r.following_id as string)
  const viewerFollowerIds = (viewerFollowerRels || []).map((r: any) => r.follower_id as string)

  // Fetch follow relationships using profile.id - NEWEST FIRST, so someone who just
  // followed (or was just followed) sits at the top and is easy to spot and follow back.
  // The users table has no idea when a follow happened, so the order has to come from the
  // `follows` rows' own created_at.
  const [{ data: followingRels }, { data: followerRels }] = await Promise.all([
    admin.from('follows').select('following_id, created_at').eq('follower_id', profile.id)
      .order('created_at', { ascending: false }),
    admin.from('follows').select('follower_id, created_at').eq('following_id', profile.id)
      .order('created_at', { ascending: false }),
  ])

  const followingIds = (followingRels || []).map((r: any) => r.following_id as string)
  const followerIds = (followerRels || []).map((r: any) => r.follower_id as string)

  // Fetch user details for both sets
  const [followingUsers, followerUsers] = await Promise.all([
    followingIds.length
      ? admin.from('users').select(USER_FIELDS).in('id', followingIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as any[] }),
    followerIds.length
      ? admin.from('users').select(USER_FIELDS).in('id', followerIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as any[] }),
  ])

  // `.in('id', ids)` returns rows in whatever order the database likes (that was the
  // "random" order), so put them back into the follow order from above. Deleted accounts
  // are simply absent from the user rows and drop out here.
  const inFollowOrder = (ids: string[], users: any[]): any[] => {
    const byId = new Map(users.map(u => [u.id as string, u]))
    return ids.map(id => byId.get(id)).filter(Boolean)
  }
  const following: any[] = inFollowOrder(followingIds, followingUsers.data || [])
  const followers: any[] = inFollowOrder(followerIds, followerUsers.data || [])

  // Mutuals = people you follow who also follow you back. Ordered by whichever of the two
  // follows is more recent, so someone who just followed you back appears first.
  const followerIdSet = new Set(followerIds)
  const at = (rels: any[] | null, key: 'following_id' | 'follower_id') =>
    new Map((rels || []).map((r: any) => [r[key] as string, new Date(r.created_at).getTime()]))
  const followingAt = at(followingRels, 'following_id')
  const followerAt = at(followerRels, 'follower_id')
  const latest = (id: string) => Math.max(followingAt.get(id) ?? 0, followerAt.get(id) ?? 0)
  const mutuals = following.filter(u => followerIdSet.has(u.id)).sort((a, b) => latest(b.id) - latest(a.id))

  return (
    <div>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 20px', height: 56,
      }}>
        <BackButton fallbackHref="/profile" label="Back to profile" />

        <div>
          <h1 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17,
            color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.2,
          }}>
            {profile.display_name}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
            @{profile.username}
          </p>
        </div>
      </div>

      <ConnectionsClient
        username={username}
        initialTab={activeTab}
        following={following}
        followers={followers}
        mutuals={mutuals}
        viewerId={viewer?.id ?? null}
        viewerFollowingIds={viewerFollowingIds}
        viewerFollowerIds={viewerFollowerIds}
      />
    </div>
  )
}