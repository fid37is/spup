import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import {
  ArrowLeft, Heart, Repeat2, MessageSquareQuote, ChevronRight,
  Eye, Video, MousePointerClick, Maximize2, UserCircle2, Zap, Bookmark,
} from 'lucide-react'
import Link from 'next/link'
import { formatNumber } from '@/lib/utils'

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
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

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

  // Hardened: both ids must exist AND match — a silent fetch failure on either
  // side (both resolving to undefined) must never accidentally evaluate true.
  const isOwner = !!viewerProfile?.id && !!author?.id && viewerProfile.id === author.id

  const engagementsCount =
    post.likes_count + post.reposts_count + post.quotes_count +
    post.bookmarks_count + post.link_clicks_count + post.detail_expands_count +
    post.profile_visits_count

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 20px',
      }}>
        <Link href={`/post/${id}`} style={{ color: 'var(--color-text-primary)', display: 'flex' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)' }}>
          Post activity
        </h1>
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

      {/* Who engaged — Likes and Quotes drill into their own dedicated screens;
          Reposts has no list behind it, so no chevron and no navigation. */}
      <div>
        <NavRow href={`/post/${id}/activity/likes`} icon={<Heart size={18} />} label="Likes" value={post.likes_count} />
        <NavRow href={`/post/${id}/activity/reposts`} icon={<Repeat2 size={18} />} label="Reposts" value={post.reposts_count} />
        <NavRow href={`/post/${id}/activity/quotes`} icon={<MessageSquareQuote size={18} />} label="Quotes" value={post.quotes_count} />
      </div>

      {/* Owner-only analytics — a compact grid of static numbers, deliberately
          NOT styled like the navigable rows above (no chevrons, not clickable)
          so it doesn't read as another drill-down list. */}
      {isOwner && (
        <div style={{ marginTop: 8, borderTop: '8px solid var(--color-surface-2)', padding: '16px 20px' }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Analytics · Only visible to you
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <StatTile icon={<Zap size={16} />} label="Engagements" value={engagementsCount} />
            <StatTile icon={<Eye size={16} />} label="Impressions" value={post.impressions_count} />
            <StatTile icon={<Bookmark size={16} />} label="Bookmarks" value={post.bookmarks_count} />
            <StatTile icon={<Video size={16} />} label="Video views" value={post.video_views_count} />
            <StatTile icon={<Maximize2 size={16} />} label="Post expands" value={post.detail_expands_count} />
            <StatTile icon={<MousePointerClick size={16} />} label="Link clicks" value={post.link_clicks_count} />
            <StatTile icon={<UserCircle2 size={16} />} label="Profile visits" value={post.profile_visits_count} />
          </div>
        </div>
      )}
    </div>
  )
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div style={{
      border: '1px solid var(--color-border)', borderRadius: 12,
      padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-muted)' }}>
        {icon}
        <span style={{ fontSize: 12 }}>{label}</span>
      </div>
      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif" }}>
        {formatNumber(value)}
      </span>
    </div>
  )
}

function NavRow({ href, icon, label, value }: { href: string; icon: React.ReactNode; label: string; value: number }) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 20px',
        borderBottom: '1px solid var(--color-border)',
        textDecoration: 'none',
      }}
    >
      <div style={{ color: 'var(--color-text-primary)' }}>{icon}</div>
      <span style={{ flex: 1, fontSize: 16, color: 'var(--color-text-primary)', fontFamily: "'DM Sans',sans-serif" }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif" }}>{formatNumber(value)}</span>
      <ChevronRight size={16} color="var(--color-text-faint)" />
    </Link>
  )
}
