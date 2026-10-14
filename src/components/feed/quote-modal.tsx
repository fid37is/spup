// src/components/feed/quote-modal.tsx
'use client'

// The "Quote" composer opened from the repost drawer in PostActions.
// Moved out of post-card.tsx unchanged.

import { useState, useTransition, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown, Globe } from 'lucide-react'
import DraftsPanel from './drafts-panel'
import { createPostAction, getViewerIdentityAction } from '@/lib/actions'
import { showSupportResources } from '@/lib/support-resources'
import type { FeedPost } from '@/lib/actions/feed'
import { useToast } from '@/components/layout/toast'
import { useTranslation } from '@/lib/i18n/language-context'
import { lockBodyScroll } from '@/lib/scroll-lock'
import { useOptionalPosting } from '@/components/layout/posting-provider'
import { useFitVisualViewport } from '@/hooks/use-fit-visual-viewport'
import { QuotedEmbed } from './post-card'

const QUOTE_PREVIEW_BORDER = 'color-mix(in srgb, var(--color-text-muted) 45%, transparent)'

// Placeholder for the audience picker ("Everyone" / who can reply). Not wired to
// anything yet - there is no audience setting on posts - so it is shown but inert.
function AudiencePill() {
  return (
    <span
      title="Coming soon"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
        padding: '2px 12px', borderRadius: 999, border: '1px solid var(--color-border-light)',
        color: 'var(--color-brand)', fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
        cursor: 'default', userSelect: 'none',
      }}
    >
      Everyone <ChevronDown size={14} />
    </span>
  )
}

function ComposerAvatar({ name, url, size }: { name: string; url?: string | null; size: number }) {
  const colors = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A1A4A', '#4A7A1A']
  const bg = colors[name.charCodeAt(0) % colors.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: url ? 'transparent' : bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: size * 0.36, color: 'white',
    }}>
      {url ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : name.slice(0, 2).toUpperCase()}
    </div>
  )
}

let viewerIdentityCache: { display_name: string; avatar_url: string | null } | null = null

export function QuoteModal({ post, onClose, currentUserId }: { post: FeedPost; onClose: () => void; currentUserId?: string }) {
  const { t } = useTranslation()
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const { success, error: toastError } = useToast()
  // Portaled to document.body below — see the note on ConfirmModal for why.
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [viewer, setViewer] = useState<{ display_name: string; avatar_url: string | null } | null>(null)
  const [showDrafts, setShowDrafts] = useState(false)
  const posting = useOptionalPosting()
  const pageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setMounted(true)
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  // On a phone the quote composer is a full page, so the page behind must not scroll.
  useEffect(() => {
    if (!isMobile) return
    return lockBodyScroll()
  }, [isMobile])
  // Phone: keep the page (and its bottom Quote bar) above the on-screen keyboard.
  useFitVisualViewport(pageRef, mounted && isMobile)
  // The quoter's own avatar (the feed card only knows their id). Fetched once and
  // reused, so reopening the composer doesn't flash initials again.
  useEffect(() => {
    if (!currentUserId) return
    if (viewerIdentityCache) { setViewer(viewerIdentityCache); return }
    let cancelled = false
    void getViewerIdentityAction()
      .then(v => { if (v) { viewerIdentityCache = v; if (!cancelled) setViewer(v) } })
      .catch(() => { /* initials fallback */ })
    return () => { cancelled = true }
  }, [currentUserId])

  function handleQuote() {
    if (!body.trim()) { setError(t('post.quote_needs_content')); return }
    // Same as every other composer: hand it to the background poster and close straight away.
    // The progress line shows at the top and a "Quote posted" toast follows (lib/posting/poster).
    if (posting) {
      posting.startPost({ body: body.trim(), quotedPostId: post.id, media: [] })
      onClose()
      return
    }
    // Outside the app shell (public pages) there is no background poster: send it here.
    startTransition(async () => {
      const result = await createPostAction({ body: body.trim(), quoted_post_id: post.id })
      if ('error' in result && result.error) { setError(result.error); toastError(result.error); return }
      if ('support' in result && result.support) showSupportResources()
      success(t('post.quote_posted'))
      onClose()
    })
  }

  if (!mounted) return null

  const canPost = !!body.trim() && !isPending
  const viewerName = viewer?.display_name || 'Me'
  const quoteLabel = isPending ? t('post.quoting') : t('post.quote')
  const draftsBtn = currentUserId ? (
    <button
      onClick={() => setShowDrafts(true)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-brand)', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", padding: '6px 4px' }}
    >
      Drafts
    </button>
  ) : <span />
  const closeBtn = (size: number) => (
    <button
      onClick={onClose}
      aria-label={t('common.cancel')}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', padding: 6, borderRadius: '50%', display: 'flex', marginLeft: -6 }}
    >
      <X size={size} />
    </button>
  )
  // Avatar on the left; on the right the comment box with the quoted post
  // indented underneath it (same left edge as the text).
  const composer = (avatarSize: number, fontSize: number, showPill: boolean) => (
    <div style={{ display: 'flex', gap: 12 }}>
      <ComposerAvatar name={viewerName} url={viewer?.avatar_url} size={avatarSize} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {showPill && <AudiencePill />}
        <textarea
          autoFocus value={body}
          onChange={e => { setBody(e.target.value); setError('') }}
          placeholder={t('post.add_comment_placeholder')} maxLength={500} rows={3}
          style={{ width: '100%', background: 'transparent', border: 'none', padding: showPill ? '8px 0 12px' : '8px 0 14px', fontSize, color: 'var(--color-text-primary)', fontFamily: "'DM Sans',sans-serif", resize: 'none', outline: 'none', boxSizing: 'border-box' }}
        />
        <QuotedEmbed q={post as unknown as NonNullable<FeedPost['quoted_post']>} borderColor={QUOTE_PREVIEW_BORDER} />
        {error && <p style={{ fontSize: 13, color: 'var(--color-error)', marginTop: 2 }}>{error}</p>}
      </div>
    </div>
  )
  const draftsPanel = showDrafts && currentUserId && (
    <DraftsPanel
      userId={currentUserId}
      onClose={() => setShowDrafts(false)}
      // A draft is text (+ media); a quote only takes the text.
      onEditDraft={draft => { setBody(draft.body.slice(0, 500)); setShowDrafts(false) }}
    />
  )

  // Mobile: a standalone full-screen page (above the bottom nav), not a modal.
  if (isMobile) {
    return createPortal(
      <>
        <div
          ref={pageRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: 0, right: 0, top: 0, height: '100dvh', zIndex: 350, display: 'flex', flexDirection: 'column',
            background: 'var(--color-bg)', animation: 'quotePageIn 0.18s ease-out',
            paddingTop: 'env(safe-area-inset-top, 0px)',
          }}
        >
          {/* Top bar: close left, Drafts right. The Quote button lives in the bottom bar, like every other composer. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', flexShrink: 0 }}>
            {closeBtn(24)}
            {draftsBtn}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px' }}>
            {composer(40, 19, false)}
          </div>

          {/* Bottom bar (rides on top of the keyboard): audience on the left, counter + Quote on the right */}
          <div style={{ flexShrink: 0, borderTop: '1px solid var(--color-border-light)', padding: '10px 16px calc(env(safe-area-inset-bottom, 0px) + 10px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span title="Coming soon" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-brand)', fontSize: 14, fontWeight: 600, cursor: 'default', minWidth: 0 }}>
              <Globe size={16} style={{ flexShrink: 0 }} /> Everyone can reply
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              {body.length > 0 && (
                <span style={{ fontSize: 12, color: 500 - body.length <= 20 ? 'var(--color-gold)' : 'var(--color-text-muted)' }}>{t('post.chars_left', { count: 500 - body.length })}</span>
              )}
              <button
                onClick={handleQuote}
                disabled={!canPost}
                style={{ padding: '9px 22px', minHeight: 40, borderRadius: 20, border: 'none', background: canPost ? 'var(--color-brand)' : 'var(--color-surface-2)', color: canPost ? 'white' : 'var(--color-text-muted)', cursor: canPost ? 'pointer' : 'not-allowed', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}
              >
                {quoteLabel}
              </button>
            </div>
          </div>
          <style>{`@keyframes quotePageIn { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:none; } }`}</style>
        </div>
        {draftsPanel}
      </>,
      document.body
    )
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--overlay-bg)', zIndex: 350 }} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)', width: 'min(600px, 95vw)',
          maxHeight: '90dvh', overflowY: 'auto',
          background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-light)',
          borderRadius: 20, padding: '12px 16px 16px', zIndex: 351, animation: 'modalIn 0.18s ease',
          boxSizing: 'border-box',
        }}
      >
        {/* Header: close left, Drafts right */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          {closeBtn(20)}
          {draftsBtn}
        </div>

        {composer(40, 18, true)}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--color-border-light)' }}>
          <span title="Coming soon" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-brand)', fontSize: 14, fontWeight: 600, cursor: 'default' }}>
            <Globe size={15} /> Everyone can reply
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('post.chars_left', { count: 500 - body.length })}</span>
            <button onClick={handleQuote} disabled={!canPost} style={{ padding: '9px 20px', borderRadius: 20, border: 'none', background: canPost ? 'var(--color-brand)' : 'var(--color-surface-2)', color: canPost ? 'white' : 'var(--color-text-muted)', cursor: canPost ? 'pointer' : 'not-allowed', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14 }}>
              {quoteLabel}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes modalIn { from { opacity:0;transform:translateY(-10px) scale(0.98); } to { opacity:1;transform:none; } }`}</style>
      {draftsPanel}
    </>,
    document.body
  )
}

// ── ActionBtn ─────────────────────────────────────────────────────────────────
