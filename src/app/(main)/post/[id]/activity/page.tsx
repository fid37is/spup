import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Heart, Repeat2, MessageSquareQuote, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { getPostLikers } from '@/lib/queries/posts'
import { formatNumber } from '@/lib/utils'
import SidebarFollowBtn from '@/components/layout/sidebar-follow-btn'
import SortMenu from './sort-menu'

function Avatar({ name, avatarUrl, size = 40 }: { name: string; avatarUrl?: string | null; size?: number }) {
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

export default async function PostActivityPage({
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

  const { data: post } = await supabase
    .from('posts')
    .select(`
      id, body, likes_count, reposts_count, quotes_count, created_at, impressions_count,
      author:users!posts_user_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq('id', id).is('deleted_at', null).single()

  if (!post) notFound()

  const author = Array.isArray(post.author) ? post.author[0] : post.author
  const likers = await getPostLikers(id, user.id, sort)

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href={`/post/${id}`} style={{ color: 'var(--color-text-primary)', display: 'flex' }}>
            <ArrowLeft size={20} />
          </Link>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)' }}>
            Post activity
          </h1>
        </div>
        <SortMenu postId={id} currentSort={sort} />
      </div>

      {/* Post preview */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{
          border: '1px solid var(--color-border)', borderRadius: 16, padding: '12px 14px',
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <Avatar name={author?.display_name || 'S'} avatarUrl={author?.avatar_url} size={32} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif" }}>
              {author?.display_name}
            </div>
            {post.body && (
              <p style={{
                margin: '2px 0 0', fontSize: 14, color: 'var(--color-text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {post.body}
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {new Date(post.created_at).toLocaleString('en-NG', {
                  hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', year: 'numeric',
                })}
              </span>
              {post.impressions_count > 0 && (
                <>
                  <span style={{ color: 'var(--color-border-light)' }}>·</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 600 }}>
                    {formatNumber(post.impressions_count)}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Views</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary rows */}
      <div>
        <SummaryRow icon={<Heart size={18} />} label="Likes" value={post.likes_count} />
        <SummaryRow icon={<Repeat2 size={18} />} label="Reposts" value={post.reposts_count} />
        <SummaryRow icon={<MessageSquareQuote size={18} />} label="Quotes" value={post.quotes_count} last />
      </div>

      {/* Likers list */}
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
              <Avatar name={liker.display_name || liker.username} avatarUrl={liker.avatar_url} size={44} />
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

function SummaryRow({ icon, label, value, last }: { icon: React.ReactNode; label: string; value: number; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '16px 20px',
      borderBottom: last ? '1px solid var(--color-border)' : '1px solid var(--color-border)',
    }}>
      <div style={{ color: 'var(--color-text-primary)' }}>{icon}</div>
      <span style={{ flex: 1, fontSize: 16, color: 'var(--color-text-primary)', fontFamily: "'DM Sans',sans-serif" }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif" }}>{formatNumber(value)}</span>
      <ChevronRight size={16} color="var(--color-text-faint)" />
    </div>
  )
}
