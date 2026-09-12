import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getPostQuoters } from '@/lib/queries/posts'
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

export default async function PostQuotesPage({
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

  const quoters = await getPostQuoters(id, user.id, sort)

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
            Quotes
          </h1>
        </div>
        <ListSortMenu basePath={`/post/${id}/activity/quotes`} currentSort={sort} />
      </div>

      {quoters.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-faint)' }}>No quotes yet.</p>
        </div>
      ) : (
        quoters.map((q: any) => (
          <div key={q.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px 4px' }}>
              <Link href={`/user/${q.author.username}`} style={{ flexShrink: 0 }}>
                <Avatar name={q.author.display_name || q.author.username} avatarUrl={q.author.avatar_url} />
              </Link>
              <Link href={`/user/${q.author.username}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {q.author.username}
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {q.author.display_name}
                </div>
                {q.author.followers_count > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 2 }}>
                    {formatNumber(q.author.followers_count)} followers
                  </div>
                )}
              </Link>
              {q.author.id !== viewerProfile?.id && (
                <SidebarFollowBtn targetUserId={q.author.id} initialFollowing={q.author.is_following} />
              )}
            </div>
            {q.body && (
              <p style={{ padding: '4px 20px 14px 76px', fontSize: 14, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
                {q.body}
              </p>
            )}
          </div>
        ))
      )}
    </div>
  )
}
