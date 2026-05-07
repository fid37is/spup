// src/components/feed/media-viewer.tsx
'use client'

import VerifiedBadge from '@/components/ui/verified-badge'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, ChevronLeft, ChevronRight, MessageCircle,
  Repeat2, ThumbsUp,
} from 'lucide-react'
import type { FeedPost } from '@/lib/actions/feed'
import { getPostRepliesAction } from '@/lib/actions/feed'
import { createPostAction } from '@/lib/actions'
import { formatRelativeTime, formatNumber } from '@/lib/utils'
import { useToast } from '@/components/layout/toast'
import { PostActions } from '@/components/feed/post-card'

interface MediaItem {
  id: string
  media_type: string
  url: string
  thumbnail_url: string | null
  width: number | null
  height: number | null
  position: number
}

interface MediaViewerProps {
  media: MediaItem[]
  initialIndex?: number
  post: FeedPost
  onClose: () => void
}

const AVATAR_COLORS = ['#1A7A4A','#7A3A1A','#1A4A7A','#4A1A7A','#7A6A1A','#1A6A6A']
function avatarBg(s: string) { return AVATAR_COLORS[s.charCodeAt(0) % AVATAR_COLORS.length] }

function SmallAvatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: url ? 'transparent' : avatarBg(name),
      overflow: 'hidden', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontWeight: 800,
      fontSize: size * 0.38, color: 'white',
      fontFamily: "'Syne', sans-serif",
    }}>
      {url
        ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : name.slice(0, 2).toUpperCase()
      }
    </div>
  )
}

function ReplyCard({ reply }: { reply: FeedPost }) {
  const router = useRouter()
  const author = reply.author
  if (!author) return null
  return (
    <div
      onClick={() => router.push(`/post/${reply.id}`)}
      style={{
        display: 'flex', gap: 10, padding: '12px 16px',
        borderBottom: '1px solid var(--color-border)',
        cursor: 'pointer', transition: 'background 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <SmallAvatar name={author.display_name} url={author.avatar_url} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text-primary)' }}>
            {author.display_name}
          </span>
          {author.verification_tier && <VerifiedBadge tier={author.verification_tier} size={14} />}
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            @{author.username} · {formatRelativeTime(reply.created_at)}
          </span>
        </div>
        {reply.body?.trim() && (
          <p style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.5, margin: 0, wordBreak: 'break-word' }}>
            {reply.body}
          </p>
        )}
        {reply.media && reply.media.length > 0 && (
          <img
            src={reply.media[0].thumbnail_url || reply.media[0].url}
            alt=""
            style={{ marginTop: 6, borderRadius: 8, maxHeight: 100, width: '100%', objectFit: 'cover' }}
          />
        )}
        <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
          {[
            { icon: <MessageCircle size={13} />, val: reply.comments_count },
            { icon: <Repeat2 size={13} />, val: reply.reposts_count },
            { icon: <ThumbsUp size={13} />, val: reply.likes_count },
          ].map(({ icon, val }, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--color-text-muted)' }}>
              {icon} {formatNumber(val)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function SidebarPanel({ post, replies, loading, onClose, onReplyPosted }: {
  post: FeedPost; replies: FeedPost[]; loading: boolean
  onClose: () => void; onReplyPosted: (r: FeedPost) => void
}) {
  const [replyText, setReplyText]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { success, error: toastError } = useToast()
  const router = useRouter()
  const author = post.author

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setReplyText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = e.target.scrollHeight + 'px'
  }

  async function submitReply() {
    if (!replyText.trim() || submitting) return
    setSubmitting(true)
    const res = await createPostAction({ body: replyText.trim(), parent_post_id: post.id })
    setSubmitting(false)
    if ('error' in res && (res as any).error) { toastError((res as any).error); return }
    setReplyText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    success('Reply posted')
    const { posts } = await getPostRepliesAction(post.id)
    if (posts[0]) onReplyPosted(posts[0])
  }

  return (
    <div className="mv-sidebar" style={{
      width: 400, flexShrink: 0,
      background: 'var(--color-surface)',
      borderLeft: '1px solid var(--color-border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      animation: 'mvSlideIn 0.22s ease',
    }}>
      {/* Fixed top */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ padding: '16px 16px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            {author && (
              <>
                <SmallAvatar name={author.display_name} url={author.avatar_url} size={40} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif" }}>
                      {author.display_name}
                    </span>
                    {author.verification_tier && author.verification_tier !== 'none' && (
                      <VerifiedBadge tier={author.verification_tier} size={14} />
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>@{author.username}</span>
                </div>
              </>
            )}
          </div>
          {post.body?.trim() && (
            <p style={{ fontSize: 15, color: 'var(--color-text-primary)', lineHeight: 1.6, margin: '0 0 8px', wordBreak: 'break-word' }}>
              {post.body}
            </p>
          )}
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {formatRelativeTime(post.created_at)}
          </span>
        </div>

        {/* Reuse PostActions — same buttons as the feed card */}
        <PostActions post={post} />

        {/* Reply composer */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <textarea
              ref={textareaRef}
              value={replyText}
              onChange={handleTextChange}
              placeholder={`Reply to @${author?.username || 'post'}\u2026`}
              rows={1}
              style={{
                width: '100%', resize: 'none', overflow: 'hidden',
                background: 'none', border: 'none', outline: 'none',
                fontSize: 14, color: 'var(--color-text-primary)',
                lineHeight: 1.5, padding: 0, fontFamily: 'inherit',
                caretColor: 'var(--color-brand)',
              }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitReply() }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button
                onClick={submitReply}
                disabled={!replyText.trim() || submitting}
                style={{
                  background: replyText.trim() ? 'var(--color-brand)' : 'var(--color-surface-3)',
                  color: replyText.trim() ? 'white' : 'var(--color-text-muted)',
                  border: 'none', borderRadius: 20,
                  padding: '6px 18px', fontSize: 13, fontWeight: 700,
                  cursor: replyText.trim() ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s',
                }}
              >
                {submitting ? 'Posting\u2026' : 'Reply'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable replies */}
      <div className="mv-sidebar" style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading replies...</span>
          </div>
        ) : replies.length === 0 ? (
          <div style={{ padding: '36px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>No replies yet</p>
            <p style={{ fontSize: 13, color: 'var(--color-text-faint)', marginTop: 4 }}>Be the first</p>
          </div>
        ) : (
          replies.map(r => <ReplyCard key={r.id} reply={r} />)
        )}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={() => { onClose(); router.push(`/post/${post.id}`) }}
            style={{
              width: '100%', padding: '9px', borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: 'var(--color-brand)',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-brand-muted, #0a2016)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            View full post & replies
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MediaViewer({ media, initialIndex = 0, post, onClose }: MediaViewerProps) {
  const [idx,      setIdx]     = useState(initialIndex)
  const [replies,  setReplies] = useState<FeedPost[]>([])
  const [loading,  setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  const current = media[idx]
  const hasPrev = idx > 0
  const hasNext = idx < media.length - 1

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    setLoading(true)
    getPostRepliesAction(post.id).then(({ posts }) => {
      setReplies(posts)
      setLoading(false)
    })
  }, [post.id])

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape')                   onClose()
    if (e.key === 'ArrowLeft'  && hasPrev)    setIdx(i => i - 1)
    if (e.key === 'ArrowRight' && hasNext)    setIdx(i => i + 1)
  }, [hasPrev, hasNext, onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [handleKey])

  if (!current) return null

  const navBtnStyle: React.CSSProperties = {
    position: 'absolute', zIndex: 10,
    width: 42, height: 42, borderRadius: '50%',
    background: 'rgba(0,0,0,0.6)', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: 'white',
    backdropFilter: 'blur(4px)', transition: 'background 0.15s',
  }

  return (
    <>
      <style>{`
        @keyframes mvFadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes mvSlideIn { from { transform:translateX(40px);opacity:0 } to { transform:translateX(0);opacity:1 } }
        .mv-sidebar::-webkit-scrollbar { width: 4px; }
        .mv-sidebar::-webkit-scrollbar-track { background: transparent; }
        .mv-sidebar::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 2px; }
        .mv-nav-btn:hover { background: rgba(0,0,0,0.85) !important; }
      `}</style>

      <div
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.95)',
          display: 'flex',
          animation: 'mvFadeIn 0.18s ease',
        }}
      >
        {/* Media panel */}
        <div style={{
          flex: 1, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 0, overflow: 'hidden',
        }}>
          <button onClick={onClose} className="mv-nav-btn" style={{ ...navBtnStyle, top: 16, left: 16 }}>
            <X size={18} />
          </button>

          {hasPrev && (
            <button onClick={() => setIdx(i => i - 1)} className="mv-nav-btn"
              style={{ ...navBtnStyle, left: 16, top: '50%', transform: 'translateY(-50%)' }}>
              <ChevronLeft size={22} />
            </button>
          )}

          {hasNext && (
            <button onClick={() => setIdx(i => i + 1)} className="mv-nav-btn"
              style={{ ...navBtnStyle, right: 16, top: '50%', transform: 'translateY(-50%)' }}>
              <ChevronRight size={22} />
            </button>
          )}

          <div key={current.id} style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: isMobile ? 0 : '48px 56px',
            boxSizing: 'border-box',
            animation: 'mvFadeIn 0.15s ease',
          }}>
            {current.media_type === 'video' ? (
              <video src={current.url} controls autoPlay
                style={{ maxWidth: '100%', maxHeight: '100vh', objectFit: 'contain', borderRadius: isMobile ? 0 : 10 }}
              />
            ) : (
              <img src={current.url} alt=""
                style={{
                  maxWidth: '100%',
                  maxHeight: isMobile ? '100vh' : 'calc(100vh - 96px)',
                  objectFit: 'contain', borderRadius: isMobile ? 0 : 10,
                  userSelect: 'none', display: 'block',
                }}
              />
            )}
          </div>

          {media.length > 1 && (
            <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
              {media.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)} style={{
                  width: i === idx ? 18 : 6, height: 6, borderRadius: 3, border: 'none',
                  background: i === idx ? 'white' : 'rgba(255,255,255,0.35)',
                  cursor: 'pointer', padding: 0, transition: 'width 0.2s, background 0.2s',
                }} />
              ))}
            </div>
          )}
        </div>

        {!isMobile && (
          <SidebarPanel
            post={post} replies={replies} loading={loading}
            onClose={onClose}
            onReplyPosted={r => setReplies(prev => [r, ...prev])}
          />
        )}
      </div>
    </>
  )
}