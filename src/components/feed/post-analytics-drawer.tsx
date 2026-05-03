'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Eye, ThumbsUp, ThumbsDown, MessageCircle, Repeat2, TrendingUp } from 'lucide-react'
import { formatNumber } from '@/lib/utils'
import type { FeedPost } from '@/lib/actions/feed'

function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  const [width, setWidth] = useState(0)
  useEffect(() => { const t = setTimeout(() => setWidth(pct), 60); return () => clearTimeout(t) }, [pct])
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
        <div style={{
          height: '100%', borderRadius: 99, background: color,
          width: `${width}%`, transition: 'width 0.55s cubic-bezier(0.34,1.56,0.64,1)',
        }} />
      </div>
    </div>
  )
}

export default function PostAnalyticsDrawer({
  post,
  onClose,
}: {
  post: FeedPost
  onClose: () => void
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Double rAF ensures the browser paints max-height:0 before transitioning to open
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

  const totalEngagements =
    post.likes_count + (post.dislikes_count || 0) +
    post.comments_count + post.reposts_count + (post.bookmarks_count || 0)

  const engRate = post.impressions_count > 0
    ? ((totalEngagements / post.impressions_count) * 100).toFixed(1)
    : '0.0'

  return (
    <div style={{
      overflow: 'hidden',
      maxHeight: open ? 520 : 0,
      opacity: open ? 1 : 0,
      transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease',
      borderBottom: '1px solid var(--color-border)',
      background: 'var(--color-surface-2)',
    }}>
      <div style={{ padding: '16px 20px 20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, background: 'var(--color-brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <TrendingUp size={14} color="white" />
            </div>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--color-text-primary)' }}>
              Post Analytics
            </span>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'var(--color-surface-3)', border: 'none', borderRadius: 8,
              cursor: 'pointer', padding: 6, color: 'var(--color-text-muted)', display: 'flex',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Top stat grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
          {([
            { icon: <Eye size={15} />, value: post.impressions_count, label: 'Views', color: '#378ADD' },
            { icon: <ThumbsUp size={15} />, value: post.likes_count, label: 'Likes', color: 'var(--color-brand)' },
            { icon: <MessageCircle size={15} />, value: post.comments_count, label: 'Replies', color: '#A855F7' },
            { icon: <Repeat2 size={15} />, value: post.reposts_count, label: 'Reposts', color: '#10B981' },
          ] as const).map(({ icon, value, label, color }) => (
            <div key={label} style={{
              background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
              borderRadius: 12, padding: '10px 8px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            }}>
              <div style={{ color }}>{icon}</div>
              <span style={{ fontSize: 17, fontWeight: 800, fontFamily: "'Syne',sans-serif", color: 'var(--color-text-primary)', lineHeight: 1 }}>
                {formatNumber(value)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif" }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Breakdown bars */}
        {totalEngagements > 0 && (
          <div style={{
            background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
            borderRadius: 12, padding: '12px 14px', marginBottom: 12,
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
              Engagement breakdown
            </p>
            <Bar label="Likes" value={post.likes_count} total={totalEngagements} color="var(--color-brand)" />
            <Bar label="Replies" value={post.comments_count} total={totalEngagements} color="#A855F7" />
            <Bar label="Reposts" value={post.reposts_count} total={totalEngagements} color="#10B981" />
            <Bar label="Dislikes" value={post.dislikes_count || 0} total={totalEngagements} color="var(--color-error)" />
            <Bar label="Saves" value={post.bookmarks_count || 0} total={totalEngagements} color="#F59E0B" />
          </div>
        )}

        {/* Engagement rate */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
          borderRadius: 12, padding: '10px 14px',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif" }}>Engagement rate</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: "'Syne',sans-serif", color: 'var(--color-text-primary)', lineHeight: 1.1 }}>
              {engRate}%
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif" }}>Total engagements</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: "'Syne',sans-serif", color: 'var(--color-text-primary)', lineHeight: 1.1 }}>
              {formatNumber(totalEngagements)}
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}