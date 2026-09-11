import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import {
  ArrowLeft, Heart, Repeat2, MessageSquareQuote, ChevronRight,
  Eye, Video, MousePointerClick, Maximize2, UserCircle2, Zap, Bookmark,
} from 'lucide-react'
import Link from 'next/link'
import { getPostLikers, getPostQuoters } from '@/lib/queries/posts'
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
  searchParams: Promise<{ sort?: string; tab?: string }>
}) {
  const { id } = await params
  const { sort: sortParam, tab: tabParam } = await searchParams
  const sort: 'recent' | 'top' = sortParam === 'top' ? 'top' : 'recent'
  const tab: 'likes' | 'quotes' = tabParam === 'quotes' ? 'quotes' : 'likes'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: viewerProfile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()

  const { data: post } = await supabase
    .from('posts')
    .select(`
      id, body, likes_count, reposts_count, quotes_count, created_at, impressions_count,
      bookmarks_count, video_views_count, link_clicks_count, detail_expands_count, profile_visits_count,
      author:users!posts_user_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq('id', id).is('deleted_at', null).single()

  if (!post) notFound()

  const author = Array.isArray(post.author) ? post.author[0] : post.author
  const isOwner = viewerProfile?.id === author?.id

  const engagementsCount =
    post.likes_count + post.reposts_count + post.quotes_count +
    post.bookmarks_count + post.link_clicks_count + post.detail_expands_count +
    post.profile_visits_count

  const [likers, quoters] = await Promise.all([
    tab === 'likes' ? getPostLikers(id, user.id, sort) : Promise.resolve([]),
    tab === 'quotes' ? getPostQuoters(id, user.id, sort) : Promise.resolve([]),
  ])

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
        <SortMenu postId={id} currentSort={sort} tab={tab} />
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

      {/* Public summary rows — Likes/Quotes are tabs into the lists below; Reposts is count-only */}
      <div>
        <SummaryTab id={id} tab="likes" active={tab === 'likes'} icon={<Heart size={18} />} label="Likes" value={post.likes_count} sort={sort} />
        <SummaryRow icon={<Repeat2 size={18} />} label="Reposts" value={post.reposts_count} />
        <SummaryTab id={id} tab="quotes" active={tab === 'quotes'} icon={<MessageSquareQuote size={18} />} label="Quotes" value={post.quotes_count} sort={sort} />
      </div>

      {/* Likers / quoters list */}
      {tab === 'likes' ? (
        likers.length === 0 ? (
          <EmptyState label="No likes yet." />
        ) : (
          likers.map((liker: any) => (
            <PersonRow key={liker.id} person={liker} viewerId={viewerProfile?.id} />
          ))
        )
      ) : (
        quoters.length === 0 ? (
          <EmptyState label="No quotes yet." />
        ) : (
          quoters.map((q: any) => (
            <div key={q.id}>
              <PersonRow person={q.author} viewerId={viewerProfile?.id} />
              {q.body && (
                <p style={{ padding: '0 20px 12px 76px', fontSize: 14, color: 'var(--color-text-secondary)', margin: 0 }}>
                  {q.body}
                </p>
              )}
            </div>
          ))
        )
      )}

      {/* Owner-only analytics — not shown to other viewers, same convention as X */}
      {isOwner && (
        <div style={{ marginTop: 24, borderTop: '8px solid var(--color-surface-2)' }}>
          <div style={{ padding: '16px 20px 4px' }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)' }}>
              Analytics
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: '2px 0 0' }}>
              Only visible to you
            </p>
          </div>
          <SummaryRow icon={<Zap size={18} />} label="Engagements" value={engagementsCount} noChevron />
          <SummaryRow icon={<Eye size={18} />} label="Impressions" value={post.impressions_count} noChevron />
          <SummaryRow icon={<Bookmark size={18} />} label="Bookmarks" value={post.bookmarks_count} noChevron />
          <SummaryRow icon={<Video size={18} />} label="Video views" value={post.video_views_count} noChevron />
          <SummaryRow icon={<Maximize2 size={18} />} label="Post expands" value={post.detail_expands_count} noChevron />
          <SummaryRow icon={<MousePointerClick size={18} />} label="Link clicks" value={post.link_clicks_count} noChevron />
          <SummaryRow icon={<UserCircle2 size={18} />} label="Profile visits" value={post.profile_visits_count} noChevron last />
        </div>
      )}
    </div>
  )
}

function PersonRow({ person, viewerId }: { person: any; viewerId?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 20px', borderBottom: '1px solid var(--color-border)',
    }}>
      <Link href={`/user/${person.username}`} style={{ flexShrink: 0 }}>
        <Avatar name={person.display_name || person.username} avatarUrl={person.avatar_url} size={44} />
      </Link>
      <Link href={`/user/${person.username}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {person.username}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {person.display_name}
        </div>
        {person.followers_count > 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 2 }}>
            {formatNumber(person.followers_count)} followers
          </div>
        )}
      </Link>
      {person.id !== viewerId && (
        <SidebarFollowBtn targetUserId={person.id} initialFollowing={person.is_following} />
      )}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
      <p style={{ fontSize: 14, color: 'var(--color-text-faint)' }}>{label}</p>
    </div>
  )
}

function SummaryRow({ icon, label, value, last, noChevron }: { icon: React.ReactNode; label: string; value: number; last?: boolean; noChevron?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '16px 20px',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{ color: 'var(--color-text-primary)' }}>{icon}</div>
      <span style={{ flex: 1, fontSize: 16, color: 'var(--color-text-primary)', fontFamily: "'DM Sans',sans-serif" }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif" }}>{formatNumber(value)}</span>
      {!noChevron && <ChevronRight size={16} color="var(--color-text-faint)" />}
    </div>
  )
}

function SummaryTab({ id, tab, active, icon, label, value, sort }: { id: string; tab: 'likes' | 'quotes'; active: boolean; icon: React.ReactNode; label: string; value: number; sort: string }) {
  return (
    <Link
      href={`/post/${id}/activity?tab=${tab}&sort=${sort}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 20px',
        borderBottom: '1px solid var(--color-border)',
        background: active ? 'var(--color-surface-2)' : 'transparent',
        textDecoration: 'none',
      }}
    >
      <div style={{ color: active ? 'var(--color-brand)' : 'var(--color-text-primary)' }}>{icon}</div>
      <span style={{ flex: 1, fontSize: 16, color: active ? 'var(--color-brand)' : 'var(--color-text-primary)', fontFamily: "'DM Sans',sans-serif", fontWeight: active ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: active ? 'var(--color-brand)' : 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif" }}>{formatNumber(value)}</span>
      <ChevronRight size={16} color={active ? 'var(--color-brand)' : 'var(--color-text-faint)'} />
    </Link>
  )
}
