// src/components/feed/post-analytics-drawer.tsx
'use client'

import { useEffect, useState } from 'react'
import { X, Eye, ThumbsUp, ThumbsDown, MessageCircle, Repeat2, Link2, Play, TrendingUp, Video, Lock } from 'lucide-react'
import { formatNumber } from '@/lib/utils'
import type { FeedPost } from '@/lib/actions/feed'

// ── Bar ───────────────────────────────────────────────────────────────────────
function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  const [width, setWidth] = useState(0)
  useEffect(() => { const t = setTimeout(() => setWidth(pct), 80); return () => clearTimeout(t) }, [pct])
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif" }}>
          {formatNumber(value)}
          <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}> · {pct}%</span>
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: 'var(--color-surface-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 99, background: color, width: `${width}%`, transition: 'width 0.55s cubic-bezier(0.34,1.56,0.64,1)' }} />
      </div>
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, sublabel }: {
  icon: React.ReactNode; label: string; value: number; color: string; sublabel?: string
}) {
  return (
    <div style={{
      background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
      borderRadius: 12, padding: '12px 8px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1,
    }}>
      <div style={{ color }}>{icon}</div>
      <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Syne',sans-serif", color: 'var(--color-text-primary)', lineHeight: 1 }}>
        {formatNumber(value)}
      </span>
      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif", textAlign: 'center', lineHeight: 1.3 }}>
        {label}
      </span>
      {sublabel && (
        <span style={{ fontSize: 9, color: 'var(--color-brand)', fontFamily: "'DM Sans',sans-serif" }}>{sublabel}</span>
      )}
    </div>
  )
}

// ── Main drawer ───────────────────────────────────────────────────────────────
export default function PostAnalyticsDrawer({
  post,
  isOwnPost,
  onClose,
}: {
  post: FeedPost
  isOwnPost: boolean
  onClose: () => void
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let id1: number, id2: number
    id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setOpen(true))
    })
    return () => { cancelAnimationFrame(id1); cancelAnimationFrame(id2) }
  }, [])

  function handleClose() {
    setOpen(false)
    setTimeout(onClose, 280)
  }

  const hasVideo = post.media?.some(m => m.media_type === 'video') ?? false
  const hasLink  = post.body ? /https?:\/\/\S+/.test(post.body) : false

  const totalEngagements =
    post.likes_count + (post.dislikes_count || 0) +
    post.comments_count + post.reposts_count + (post.bookmarks_count || 0)

  const engRate = post.impressions_count > 0
    ? ((totalEngagements / post.impressions_count) * 100).toFixed(1)
    : '0.0'

  const videoCompletionRate = (post.video_views_count || 0) > 0
    ? (((post.video_completions_count || 0) / (post.video_views_count || 1)) * 100).toFixed(0)
    : '0'

  return (
    <div style={{
      overflow: 'hidden',
      maxHeight: open ? 700 : 0,
      opacity: open ? 1 : 0,
      transition: 'max-height 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease',
      borderBottom: '1px solid var(--color-border)',
      background: 'var(--color-surface-2)',
    }}>
      <div style={{ padding: '16px 16px 20px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--color-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={14} color="white" />
            </div>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--color-text-primary)' }}>
              Post Analytics
            </span>
          </div>
          <button
            onClick={handleClose}
            style={{ background: 'var(--color-surface-3)', border: 'none', borderRadius: 8, cursor: 'pointer', padding: 6, color: 'var(--color-text-muted)', display: 'flex' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Non-author: public counts + locked notice ── */}
        {!isOwnPost && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <StatCard icon={<Eye size={15} />}         label="Impressions" value={post.impressions_count}   color="#378ADD" />
              <StatCard icon={<ThumbsUp size={15} />}    label="Likes"       value={post.likes_count}         color="var(--color-brand)" />
              <StatCard icon={<ThumbsDown size={15} />}  label="Dislikes"    value={post.dislikes_count || 0} color="var(--color-error)" />
              <StatCard icon={<MessageCircle size={15} />} label="Replies"   value={post.comments_count}      color="#A855F7" />
              <StatCard icon={<Repeat2 size={15} />}     label="Reposts"     value={post.reposts_count}       color="#10B981" />
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
              borderRadius: 12, padding: '12px 14px',
            }}>
              <div style={{ flexShrink: 0, color: 'var(--color-text-muted)' }}><Lock size={18} /></div>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, fontFamily: "'Syne',sans-serif", color: 'var(--color-text-primary)' }}>
                  Full analytics are private
                </p>
                <p style={{ margin: 0, fontSize: 12, fontFamily: "'DM Sans',sans-serif", color: 'var(--color-text-muted)', marginTop: 2 }}>
                  Only the post author can see detailed performance data.
                </p>
              </div>
            </div>
          </>
        )}

        {/* ── Author: full analytics ── */}
        {isOwnPost && (
          <>
            {/* Reach */}
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Reach</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <StatCard icon={<Eye size={15} />}         label="Impressions" value={post.impressions_count} color="#378ADD" sublabel="Unique viewers" />
              <StatCard icon={<MessageCircle size={15} />} label="Replies"   value={post.comments_count}    color="#A855F7" />
              <StatCard icon={<Repeat2 size={15} />}     label="Reposts"     value={post.reposts_count}     color="#10B981" />
            </div>

            {/* Engagement */}
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Engagement</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <StatCard icon={<ThumbsUp size={15} />}   label="Likes"    value={post.likes_count}         color="var(--color-brand)" />
              <StatCard icon={<ThumbsDown size={15} />} label="Dislikes" value={post.dislikes_count || 0} color="var(--color-error)" />
              {hasLink
                ? <StatCard icon={<Link2 size={15} />} label="Link clicks" value={post.link_clicks_count || 0} color="#F59E0B" />
                : <StatCard icon={<TrendingUp size={15} />} label="Total eng." value={totalEngagements} color="#378ADD" />
              }
            </div>

            {/* Video — only if post has video */}
            {hasVideo && (
              <>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Video</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <StatCard icon={<Play size={15} />}  label="Video views"  value={post.video_views_count || 0}       color="#EC4899" sublabel="Watched 3s+" />
                  <StatCard icon={<Video size={15} />} label="Completions"  value={post.video_completions_count || 0} color="#8B5CF6" sublabel={`${videoCompletionRate}% rate`} />
                </div>
              </>
            )}

            {/* Breakdown bars */}
            {totalEngagements > 0 && (
              <div style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Breakdown</p>
                <Bar label="Likes"    value={post.likes_count}         total={totalEngagements} color="var(--color-brand)" />
                <Bar label="Replies"  value={post.comments_count}      total={totalEngagements} color="#A855F7" />
                <Bar label="Reposts"  value={post.reposts_count}       total={totalEngagements} color="#10B981" />
                <Bar label="Dislikes" value={post.dislikes_count || 0} total={totalEngagements} color="var(--color-error)" />
              </div>
            )}

            {/* Engagement rate */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px 14px' }}>
              <div>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif", textTransform: 'uppercase', letterSpacing: '0.04em' }}>Engagement rate</p>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: "'Syne',sans-serif", color: 'var(--color-text-primary)', lineHeight: 1.1 }}>{engRate}%</p>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif" }}>engagements ÷ impressions</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif", textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total engagements</p>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: "'Syne',sans-serif", color: 'var(--color-text-primary)', lineHeight: 1.1 }}>{formatNumber(totalEngagements)}</p>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}