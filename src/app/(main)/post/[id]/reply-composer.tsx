'use client'

// src/app/(main)/post/[id]/reply-composer.tsx
//
// The reply box under the root post: type and post directly, right here,
// no navigation. This is the established pattern for this composer - not
// the thing the Threads redesign touched. The dedicated fullscreen screen
// (/compose?replyTo=) is for replying to a specific comment/reply further
// down the thread (see reply-to-reply.tsx) - the Maximize2 button here is
// just an explicit opt-in for someone who wants more room to write.

import { useState, useRef, useEffect, useTransition, useCallback } from 'react'
import { ImageIcon, VideoIcon, X, Loader2, BarChart2, MapPin, Maximize2 } from 'lucide-react'
import { createPostAction } from '@/lib/actions'
import { showSupportResources } from '@/lib/support-resources'
import { useRouter } from 'next/navigation'
import { useMediaUpload } from '@/hooks/use-media-upload'
import MediaGrid from '@/components/feed/media-grid'
import { useToast } from '@/components/layout/toast'
import { useMentionAutocomplete } from '@/hooks/use-mention-autocomplete'
import MentionSuggestions from '@/components/shared/mention-suggestions'
import { useTranslation } from '@/lib/i18n/language-context'

const MAX_CHARS = 500

interface ReplyComposerProps {
  parentPostId: string
  viewerInitial: string
  viewerAvatar: string | null
  viewerName?: string
  /** Called with the newly created post (when the server returned one). */
  onPosted?: (post: unknown) => void
}

export default function ReplyComposer({
  parentPostId,
  viewerInitial,
  viewerAvatar,
  onPosted,
}: ReplyComposerProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const { success, error: toastError } = useToast()

  const [body, setBody] = useState('')
  const [focused, setFocused] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [showMedia, setShowMedia] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const { media, uploading, progress, error: uploadError, upload, remove, clear } = useMediaUpload()

  // This bar must always sit at the very bottom of what's actually visible
  // and ride up above the on-screen keyboard - never just wherever it falls
  // in the page. `position: fixed` alone isn't enough on mobile: the
  // keyboard shrinks the *visual* viewport, not the layout one, so a plain
  // `bottom: 0` element stays pinned to the bottom of the full page and
  // ends up hidden behind the keyboard instead of sitting above it.
  // window.visualViewport reports the real visible rectangle - same
  // technique chat-viewport.tsx already uses for the fullscreen composer -
  // so we track it here too and push the bar up by exactly the keyboard's
  // height, no more, no less, updating live as it opens and closes.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    function apply() {
      const bar = barRef.current
      if (!bar || !vv) return
      const hiddenByKeyboard = window.innerHeight - vv.height - vv.offsetTop
      bar.style.bottom = `${Math.max(0, hiddenByKeyboard)}px`
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
    }
  }, [])

  // This bar is `position: fixed` so it stays pinned to the bottom of the
  // viewport while replies scroll underneath it - same as the mobile app,
  // and unchanged from how this has always worked. But `fixed` positions
  // against the whole viewport, with no idea that .main-layout centers a
  // bounded, sidebar-flanked column (see (main)/layout.tsx) - left a plain
  // `left: 0; right: 0` stretching the bar edge-to-edge over both sidebars
  // on desktop. `anchorRef` is a zero-height div left in the composer's
  // *normal* DOM position, right where it's always sat in the thread (under
  // the root post) - since it isn't fixed, it naturally takes on the feed
  // column's real width and left offset. We measure it and paint those
  // exact numbers onto the fixed bar, so the bar tracks the column instead
  // of the viewport. On mobile the sidebars are hidden and the column
  // already spans the full width, so this measurement collapses back to
  // the original edge-to-edge behavior with no separate mobile-only case.
  useEffect(() => {
    const anchor = anchorRef.current
    const bar = barRef.current
    if (!anchor || !bar) return
    function apply() {
      if (!anchor || !bar) return
      const rect = anchor.getBoundingClientRect()
      bar.style.left = `${rect.left}px`
      bar.style.width = `${rect.width}px`
    }
    apply()
    window.addEventListener('resize', apply)
    const ro = new ResizeObserver(apply)
    ro.observe(anchor)
    return () => {
      window.removeEventListener('resize', apply)
      ro.disconnect()
    }
  }, [])

  const charsLeft = MAX_CHARS - body.length
  const isOverLimit = charsLeft < 0
  const isWarning = charsLeft <= 30
  const hasContent = body.trim().length > 0 || media.length > 0
  const canPost = hasContent && !isOverLimit && !isPending && !uploading
  const isExpanded = focused || body.length > 0 || media.length > 0

  const radius = 10
  const circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - Math.min(body.length / MAX_CHARS, 1) * circumference

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value)
    setError('')
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' }
    mention.recheck()
  }

  const mention = useMentionAutocomplete({
    value: body,
    onChange: next => { setBody(next); setError('') },
    textareaRef,
  })

  function handleReply() {
    if (!canPost) return
    startTransition(async () => {
      const readyMedia = media.filter(m => m.cloudinary_id)
      const result = await createPostAction({
        body: body.trim() || undefined,
        parent_post_id: parentPostId,
        media: readyMedia.length > 0 ? readyMedia.map(m => ({
          url: m.url,
          thumbnail_url: m.thumbnail_url ?? undefined,
          media_type: m.media_type as 'image' | 'video',
          width: m.width ?? undefined,
          height: m.height ?? undefined,
          cloudinary_id: m.cloudinary_id!,
        })) : undefined,
      })
      if ('error' in result && result.error) {
        setError(result.error)
        toastError(result.error)
        return
      }
      if ('support' in result && result.support) showSupportResources()
      setBody('')
      setError('')
      setShowMedia(false)
      setFocused(false)
      clear()
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      success(t('post.reply_posted'))
      if (onPosted && 'post' in result && result.post) onPosted(result.post)
      else router.refresh()
    })
  }

  const handleUpload = useCallback((files: FileList | File[]) => {
    upload(files)
    setShowMedia(true)
  }, [upload])

  return (
    <>
      {/* Zero-height, stays in normal flow right where this composer has
          always lived in the thread - purely a ruler for the fixed bar
          below to measure the feed column's real width/offset against. */}
      <div ref={anchorRef} aria-hidden style={{ height: 0 }} />
      <div
        ref={barRef}
        className="reply-composer-bar"
        style={{
          position: 'fixed',
          bottom: 0,
          zIndex: 20,
          background: 'var(--nav-bg)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--color-border)',
          transition: 'bottom 0.1s ease-out',
        }}
      >
      <div style={{
        padding: isExpanded
          ? '12px 16px calc(8px + env(safe-area-inset-bottom))'
          : '10px 16px calc(10px + env(safe-area-inset-bottom))',
        display: 'flex', gap: 12, alignItems: 'flex-start',
        position: 'relative',
      }}>
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: viewerAvatar ? 'transparent' : 'var(--color-brand)',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 13, color: 'white',
          marginTop: 2,
        }}>
          {viewerAvatar
            ? <img src={viewerAvatar} alt={viewerInitial} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : viewerInitial
          }
        </div>

        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {/* Textarea - type and post directly, right here */}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleChange}
            onFocus={() => setFocused(true)}
            onClick={mention.recheck}
            onKeyUp={mention.recheck}
            onBlur={() => { mention.close(); if (!body && !media.length) setFocused(false) }}
            onKeyDown={e => {
              if (mention.handleKeyDown(e)) return
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleReply()
            }}
            placeholder={t('composer.reply_input_placeholder')}
            rows={1}
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              resize: 'none',
              outline: 'none',
              fontSize: 15,
              color: isOverLimit ? 'var(--color-error)' : 'var(--color-text-primary)',
              fontFamily: "'DM Sans', sans-serif",
              lineHeight: 1.5,
              caretColor: 'var(--color-brand)',
              minHeight: 36,
              maxHeight: 160,
              boxSizing: 'border-box',
              padding: '8px 0',
              WebkitAppearance: 'none',
              display: 'block',
            }}
          />

          {mention.isOpen && (
            <MentionSuggestions
              results={mention.results}
              activeIndex={mention.activeIndex}
              loading={mention.loading}
              onHover={mention.setActiveIndex}
              onSelect={mention.selectUser}
              placement="above"
            />
          )}

          {/* Media grid */}
          {showMedia && (
            <div style={{ marginTop: 8 }}>
              <MediaGrid
                media={media}
                uploading={uploading}
                progress={progress}
                error={uploadError}
                onUpload={handleUpload}
                onRemove={remove}
              />
            </div>
          )}

          {error && (
            <div style={{ fontSize: 13, color: 'var(--color-error)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <X size={12} /> {error}
            </div>
          )}

          {/* Toolbar — only when expanded */}
          {isExpanded && (
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--color-border)',
              paddingTop: 8, marginTop: 4,
            }}>
              <div style={{ display: 'flex', gap: 2 }}>
                <ToolbarBtn
                  icon={<ImageIcon size={17} />}
                  label={t('composer.add_image')}
                  onClick={() => {
                    setShowMedia(true)
                    ;(document.getElementById('reply-img-input') as HTMLInputElement | null)?.click()
                  }}
                />
                <ToolbarBtn
                  icon={<VideoIcon size={17} />}
                  label={t('composer.add_video')}
                  onClick={() => {
                    setShowMedia(true)
                    ;(document.getElementById('reply-vid-input') as HTMLInputElement | null)?.click()
                  }}
                />
                <ToolbarBtn icon={<BarChart2 size={17} />} label="Poll (coming soon)" onClick={() => {}} disabled />
                <ToolbarBtn icon={<MapPin size={17} />} label="Location (coming soon)" onClick={() => {}} disabled />
                <ToolbarBtn
                  icon={<Maximize2 size={16} />}
                  label={t('composer.expand_fullscreen')}
                  onClick={() => router.push(`/compose?replyTo=${parentPostId}`)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {body.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width={22} height={22} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
                      <circle cx={11} cy={11} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={2.5} />
                      <circle cx={11} cy={11} r={radius} fill="none"
                        stroke={isOverLimit ? 'var(--color-error)' : isWarning ? 'var(--color-gold)' : 'var(--color-brand)'}
                        strokeWidth={2.5}
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeOffset}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 0.1s, stroke 0.2s' }}
                      />
                    </svg>
                    {isWarning && (
                      <span style={{ fontSize: 11, color: isOverLimit ? 'var(--color-error)' : 'var(--color-gold)', fontWeight: 700 }}>
                        {charsLeft}
                      </span>
                    )}
                  </div>
                )}

                <button
                  onClick={handleReply}
                  disabled={!canPost}
                  style={{
                    background: canPost ? 'var(--color-brand)' : 'var(--color-surface-3)',
                    color: canPost ? 'white' : 'var(--color-text-muted)',
                    border: 'none', borderRadius: 20, padding: '7px 18px',
                    fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13,
                    cursor: canPost ? 'pointer' : 'not-allowed',
                    transition: 'background 0.15s, color 0.15s',
                    display: 'flex', alignItems: 'center', gap: 5,
                    whiteSpace: 'nowrap', minHeight: 34,
                    // Fixed width + centred so swapping the label for the
                    // spinner doesn't make the button jump in size.
                    minWidth: 70, justifyContent: 'center',
                  }}
                >
                  {/* Spinner only while sending - no "Replying…" text. */}
                  {isPending
                    ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                    : t('composer.reply')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Collapsed: reply pill */}
        {!isExpanded && (
          <button
            onClick={() => { setFocused(true); textareaRef.current?.focus() }}
            style={{
              background: 'var(--color-surface-3)',
              color: 'var(--color-text-muted)',
              border: 'none', borderRadius: 20, padding: '7px 18px',
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13,
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              alignSelf: 'center',
            }}
          >
            Reply
          </button>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        id="reply-img-input"
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files) { handleUpload(e.target.files); e.target.value = '' } }}
      />
      <input
        id="reply-vid-input"
        type="file"
        accept="video/mp4,video/webm,video/mov,video/avi"
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files) { handleUpload(e.target.files); e.target.value = '' } }}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  )
}

function ToolbarBtn({ icon, label, onClick, disabled = false }: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        width: 34, height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--color-text-faint)' : 'var(--color-brand)',
        borderRadius: 8,
        transition: 'background 0.12s',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {icon}
    </button>
  )
}