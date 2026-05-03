// src/app/(main)/connections/[username]/page.tsx
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notFound, redirect }              from 'next/navigation'
import { ArrowLeft }                       from 'lucide-react'
import Link                                from 'next/link'
import ConnectionsClient                   from './connections-client'
import type { Metadata }                   from 'next'

type Tab = 'following' | 'followers' | 'mutuals'

const VALID_TABS: Tab[] = ['following', 'followers', 'mutuals']

const USER_FIELDS = 'id, username, display_name, avatar_url, verification_tier, is_monetised, followers_count, bio'

interface PageProps {
  params:       Promise<{ username: string }>
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
  const sp           = await searchParams
  const rawTab       = sp?.tab ?? 'following'
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

  const isOwn    = viewer?.id === profile.id
  const backHref = isOwn ? '/profile' : `/user/${username}`

  // Fetch follow relationships using profile.id
  const [{ data: followingRels }, { data: followerRels }] = await Promise.all([
    admin.from('follows').select('following_id').eq('follower_id', profile.id),
    admin.from('follows').select('follower_id').eq('following_id', profile.id),
  ])

  const followingIds = (followingRels || []).map((r: any) => r.following_id as string)
  const followerIds  = (followerRels  || []).map((r: any) => r.follower_id  as string)

  // Fetch user details for both sets
  const [followingUsers, followerUsers] = await Promise.all([
    followingIds.length
      ? admin.from('users').select(USER_FIELDS).in('id', followingIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as any[] }),
    followerIds.length
      ? admin.from('users').select(USER_FIELDS).in('id', followerIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const following: any[] = followingUsers.data || []
  const followers: any[] = followerUsers.data  || []

  // Mutuals = people you follow who also follow you back
  const followerIdSet = new Set(followerIds)
  const mutuals = following.filter(u => followerIdSet.has(u.id))

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
        <Link
          href={backHref}
          aria-label="Back"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: '50%',
            color: 'var(--color-text-primary)', textDecoration: 'none',
          }}
        >
          <ArrowLeft size={20} />
        </Link>
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
      />
    </div>
  )
}