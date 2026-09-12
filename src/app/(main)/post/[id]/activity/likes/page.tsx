import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getPostLikers } from '@/lib/queries/posts'
import { formatNumber } from '@/lib/utils'
import SidebarFollowBtn from '@/components/layout/sidebar-follow-btn'
import ListSortMenu from '../list-sort-menu'

function Avatar({ name, avatarUrl, size = 44 }: { name: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, fontFamily: "'Syne',sans-serif",
    }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

export default async function PostLikesPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sort?: string }>
}) {
  const { id } = await params
  const { sort: sortParam } = await searchParams
  const sort: 'recent' | 'top' = sortParam === 'top' ? 'top' : 'recent'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: viewerProfile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()

  const { data: post } = await supabase.from('posts').select('id').eq('id', id).is('deleted_at', null).single()
  if (!post) notFound()

  const likers = await getPostLikers(id, user.id, sort)

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href={`/post/${id}/activity`} style={{ color: 'var(--color-text-primary)', display: 'flex' }}>
            <ArrowLeft size={20} />
          </Link>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)' }}>
            Liked by
          </h1>
        </div>
        <ListSortMenu basePath={`/post/${id}/activity/likes`} currentSort={sort} />
      </div>

      {likers.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-faint)' }}>No likes yet.</p>
        </div>
      ) : (
        likers.map((liker: any) => (
          <div key={liker.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 20px', borderBottom: '1px solid var(--color-border)',
          }}>
            <Link href={`/user/${liker.username}`} style={{ flexShrink: 0 }}>
              <Avatar name={liker.display_name || liker.username} avatarUrl={liker.avatar_url} />
            </Link>
            <Link href={`/user/${liker.username}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {liker.username}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {liker.display_name}
              </div>
              {liker.followers_count > 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 2 }}>
                  {formatNumber(liker.followers_count)} followers
                </div>
              )}
            </Link>
            {liker.id !== viewerProfile?.id && (
              <SidebarFollowBtn targetUserId={liker.id} initialFollowing={liker.is_following} />
            )}
          </div>
        ))
      )}
    </div>
  )
}
