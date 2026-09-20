'use client'

import { useState, useRef, useTransition, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react'
import { ImageIcon, X, Loader2, Globe, BarChart2, MapPin, Camera, Mic, Tag } from 'lucide-react'
import { createPostAction } from '@/lib/actions'
import { useToast } from '@/components/layout/toast'
import { useNetworkStatus } from '@/lib/network-status'
import { queueOfflinePost, registerBackgroundSync } from '@/lib/offline-post-queue'
import SchedulePicker, { formatScheduled } from '@/components/feed/schedule-picker'
import { saveDraft, deleteDraft, hasMeaningfulContent, newDraftId, type LocalDraft } from '@/lib/local-drafts'
import { MAX_MEDIA_PER_POST, MAX_POST_MEDIA_BYTES, POST_MEDIA_TOO_BIG, selectFilesForPost, mediaKindOf } from '@/lib/media-limits'
import { compressImageForUpload, createUploadQueue } from '@/lib/media-client'
import { uploadMedia, UploadCancelledError } from '@/lib/upload-media'

const MAX_CHARS = 500
const MAX_MEDIA = MAX_MEDIA_PER_POST

interface MediaItem {
  tempId: string         // local temp key for React list
  cloudinary_id?: string // set after upload completes
  url: string            // Cloudinary URL (set after upload)
  media_type: 'image' | 'video'
  thumbnail_url?: string | null
  width?: number
  height?: number
  duration_secs?: number | null
  size_bytes?: number
  uploading?: boolean
  progress?: number       // 0-100 while uploading
  offlineQueued?: boolean  // network was degraded/offline when attached - raw file is held in fileMapRef, never uploaded to Cloudinary directly
  error?: string
  localPreview: string   // object URL for immediate preview
}

interface PostComposerProps {
  onPosted?: (post: unknown) => void
  authorName?: string
  authorAvatarUrl?: string | null
  // Local drafts are saved to localStorage scoped to this id - omit it (no
  // signed-in profile yet) and autosave is simply skipped.
  userId?: string
  // 'fullscreen' hides this component's own footer Post button/char-ring -
  // used on mobile, where the header (owned by the parent) renders Post
  // instead, matching X's layout. 'modal' (default) keeps everything here,
  // used for the desktop centered dialog.
  variant?: 'modal' | 'fullscreen'
  onStateChange?: (state: { canPost: boolean; isPending: boolean; hasUploading: boolean; isScheduled: boolean }) => void
}

export interface PostComposerHandle {
  submit: () => void
  loadDraft: (draft: LocalDraft) => void
}

const PostComposer = forwardRef<PostComposerHandle, PostComposerProps>(function PostComposer(
  { onPosted, authorName = 'P', authorAvatarUrl, userId, variant = 'modal', onStateChange },
  ref
) {
  const [body, setBody] = useState('')
  const [media, setMedia] = useState<MediaItem[]>([])
  const [isSelling, setIsSelling] = useState(false)
  const [scheduledAt, setScheduledAt] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { success: toastSuccess } = useToast()
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileMapRef = useRef<Map<string, File>>(new Map())
  // Photos are compressed and uploaded a few at a time, not all at once -
  // with up to 10 per post, a burst of parallel uploads on a slow
  // connection makes every one of them crawl (and time out).
  const uploadQueueRef = useRef(createUploadQueue(3))
  // Size of each item in this post (photos after compression), to enforce the 25MB-per-post cap.
  const mediaBytesRef = useRef<Map<string, number>>(new Map())
  // In-flight uploads, so removing a photo mid-upload stops it (saves data).
  const abortRef = useRef<Map<string, AbortController>>(new Map())

  // Stable id for the local draft this compose session autosaves to - kept
  // across edits so re-saving updates the same entry instead of piling up
  // duplicates. Regenerated after a successful post/schedule/clear.
  const draftIdRef = useRef<string>(newDraftId())
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { status: networkStatus } = useNetworkStatus()
  const networkStatusRef = useRef(networkStatus)
  networkStatusRef.current = networkStatus

  const charsLeft = MAX_CHARS - body.length
  const isOverLimit = charsLeft < 0
  const isWarning = charsLeft <= 30
  const hasUploading = media.some(m => m.uploading)
  const canPost = (body.trim().length > 0 || media.filter(m => !m.uploading && !m.error).length > 0)
    && !isOverLimit && !isPending && !hasUploading && (!isSelling || body.trim().length > 0)

  useEffect(() => {
    onStateChange?.({ canPost, isPending, hasUploading, isScheduled: !!scheduledAt })
  }, [canPost, isPending, hasUploading, scheduledAt, onStateChange])

  // Debounced local autosave - anything typed and then closed without
  // sending shows up later in the Drafts panel. Only saves media that has
  // actually finished uploading (a real, stable Cloudinary URL); in-flight
  // blobs can't survive a reload anyway.
  useEffect(() => {
    if (!userId) return
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current)
    const uploadedMedia = media.filter(m => !m.uploading && !m.error && m.cloudinary_id)
    if (!hasMeaningfulContent(body, uploadedMedia.length)) return
    draftSaveTimer.current = setTimeout(() => {
      saveDraft(userId, {
        id: draftIdRef.current,
        body,
        media: uploadedMedia.map(m => ({
          url: m.url, thumbnail_url: m.thumbnail_url, media_type: m.media_type,
          width: m.width, height: m.height, duration_secs: m.duration_secs,
          size_bytes: m.size_bytes, cloudinary_id: m.cloudinary_id,
        })),
        isSelling,
        updatedAt: new Date().toISOString(),
      })
    }, 800)
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current) }
  }, [userId, body, media, isSelling])

  useImperativeHandle(ref, () => ({
    submit: () => handlePost(),
    loadDraft: (draft: LocalDraft) => {
      draftIdRef.current = draft.id
      setBody(draft.body)
      setIsSelling(draft.isSelling)
      setMedia(draft.media.map(m => ({
        tempId: `draft_${draft.id}_${m.url}`,
        cloudinary_id: m.cloudinary_id,
        url: m.url,
        media_type: m.media_type,
        thumbnail_url: m.thumbnail_url,
        width: m.width,
        height: m.height,
        duration_secs: m.duration_secs,
        size_bytes: m.size_bytes,
        localPreview: m.url,
      })))
      setError('')
      requestAnimationFrame(() => {
        const ta = textareaRef.current
        if (ta) { ta.focus(); ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' }
      })
    },
  }))

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value)
    setError('')
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' }
  }

  const uploadFile = useCallback(async (file: File, type: 'image' | 'video') => {
    const localPreview = URL.createObjectURL(file)
    const tempId = `temp_${Date.now()}_${Math.random()}`
    fileMapRef.current.set(tempId, file)

    if (networkStatusRef.current !== 'online') {
      // Can't reliably upload right now - hold the raw file and let
      // handlePost's offline branch queue the whole post for later,
      // rather than firing a Cloudinary upload that'll likely time out.
      setMedia(prev => [...prev, {
        tempId, url: localPreview, media_type: type, localPreview,
        uploading: false, offlineQueued: true,
      }])
      // Shrink the held copy in the background so the eventual upload (on
      // whatever connection comes back) is small. If the person taps Post
      // before this finishes, the original is queued instead - still fine.
      if (type === 'image') {
        void compressImageForUpload(file).then(small => {
          if (fileMapRef.current.has(tempId)) fileMapRef.current.set(tempId, small)
        })
      }
      return
    }

    // Add placeholder immediately so user sees preview while uploading
    setMedia(prev => [...prev, {
      tempId,
      url: localPreview,
      media_type: type,
      localPreview,
      uploading: true,
    }])

    try {
      await uploadQueueRef.current(async () => {
        // Removed while waiting its turn - don't spend data on it.
        if (!fileMapRef.current.has(tempId)) return

        // Phone photos are often 3-8MB; shrink before sending (photos only).
        const toSend = type === 'image' ? await compressImageForUpload(file) : file

        const others = Array.from(mediaBytesRef.current.entries())
          .filter(([id]) => id !== tempId && fileMapRef.current.has(id))
          .reduce((sum, [, bytes]) => sum + bytes, 0)
        if (others + toSend.size > MAX_POST_MEDIA_BYTES) {
          setMedia(prev => prev.map(m =>
            m.tempId === tempId ? { ...m, uploading: false, error: POST_MEDIA_TOO_BIG } : m
          ))
          return
        }
        mediaBytesRef.current.set(tempId, toSend.size)

        // Straight to Cloudinary from the phone (signed by /api/upload/signature),
        // with real progress and automatic retry if the connection drops.
        const controller = new AbortController()
        abortRef.current.set(tempId, controller)
        let uploaded
        try {
          uploaded = await uploadMedia(toSend, type, pct => {
            setMedia(prev => prev.map(m => m.tempId === tempId ? { ...m, progress: pct } : m))
          }, controller.signal)
        } finally {
          abortRef.current.delete(tempId)
        }

        // Replace temp with real Cloudinary data
        setMedia(prev => prev.map(m =>
          m.tempId === tempId ? {
            tempId,
            cloudinary_id: uploaded.cloudinary_id,
            url: uploaded.url,
            media_type: uploaded.media_type,
            thumbnail_url: uploaded.thumbnail_url,
            width: uploaded.width ?? undefined,
            height: uploaded.height ?? undefined,
            duration_secs: uploaded.duration_secs,
            size_bytes: uploaded.size_bytes,
            localPreview,
            uploading: false,
          } : m
        ))
      })
    } catch (err) {
      // Removed mid-upload - the item is already gone, nothing to report.
      if (err instanceof UploadCancelledError) return
      setMedia(prev => prev.map(m =>
        m.tempId === tempId ? { ...m, uploading: false, error: err instanceof Error && err.message ? err.message : 'Upload failed. Try again.' } : m
      ))
    }
  }, [])

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    // Check type, per-file size (photo 10MB / video 25MB), the 4-item cap
    // and the 2-video cap up front, so nothing doomed gets uploaded.
    const existing = media.filter(m => !m.error).map(m => m.media_type)
    const { accepted, error: selectError } = selectFilesForPost(existing, Array.from(files))
    setError(selectError ?? '')

    accepted.forEach(file => {
      uploadFile(file, mediaKindOf(file) ?? 'image')
    })
  }

  function removeMedia(tempId: string) {
    fileMapRef.current.delete(tempId)
    mediaBytesRef.current.delete(tempId)
    abortRef.current.get(tempId)?.abort()
    setMedia(prev => {
      const item = prev.find(m => m.tempId === tempId)
      if (item?.localPreview) URL.revokeObjectURL(item.localPreview)
      return prev.filter(m => m.tempId !== tempId)
    })
  }

  function handlePost() {
    if (!canPost) return

    const needsQueueing = networkStatusRef.current !== 'online' || media.some(m => m.offlineQueued)

    // Scheduling needs a live round-trip to createPostAction (it's what sets
    // the future created_at) - it can't be handed to the offline queue,
    // which just replays a plain createPostAction call once back online.
    // The Schedule button is already hidden/disabled while offline, so this
    // is only a safety net.
    if (needsQueueing && !scheduledAt) {
      const bodyText = body.trim() || null
      const isSellingSnapshot = isSelling
      const queuedMedia = media
        .map(m => {
          const blob = fileMapRef.current.get(m.tempId)
          return blob ? { blob, mediaType: m.media_type, name: m.tempId } : null
        })
        .filter((m): m is { blob: File; mediaType: 'image' | 'video'; name: string } => !!m)

      startTransition(async () => {
        await queueOfflinePost({ body: bodyText, isSelling: isSellingSnapshot, media: queuedMedia })
        registerBackgroundSync()

        media.forEach(m => { if (m.localPreview) URL.revokeObjectURL(m.localPreview) })
        fileMapRef.current.clear()
        setBody('')
        setMedia([])
        setIsSelling(false)
        setError('')
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
        toastSuccess("Post queued - it'll go out once you're back online")
        // No real post to prepend to the feed yet - onPosted(null) just
        // tells the parent to close the composer.
        onPosted?.(null)
      })
      return
    }

    const readyMedia = media.filter(m => !m.uploading && !m.error && m.cloudinary_id)
    startTransition(async () => {
      const result = await createPostAction({
        body: body.trim() || undefined,
        is_selling: isSelling || undefined,
        scheduled_at: scheduledAt || undefined,
        media: readyMedia.length > 0 ? readyMedia.map(m => ({
          url: m.url,
          thumbnail_url: m.thumbnail_url,
          media_type: m.media_type,
          width: m.width,
          height: m.height,
          duration_secs: m.duration_secs,
          size_bytes: m.size_bytes,
          cloudinary_id: m.cloudinary_id!,
        })) : undefined,
      })
      if ('error' in result && result.error) { setError(result.error); return }
      // Cleanup object URLs
      media.forEach(m => { if (m.localPreview) URL.revokeObjectURL(m.localPreview) })
      fileMapRef.current.clear()
      mediaBytesRef.current.clear()
      if (userId) deleteDraft(userId, draftIdRef.current)
      draftIdRef.current = newDraftId()
      const wasScheduled = 'scheduled' in result && result.scheduled
      const scheduledFor = 'scheduledFor' in result ? result.scheduledFor : undefined
      setBody('')
      setMedia([])
      setIsSelling(false)
      setScheduledAt(null)
      setError('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      toastSuccess(wasScheduled && scheduledFor ? `Scheduled for ${formatScheduled(scheduledFor)}` : 'Your post is live')
      // A scheduled post isn't visible anywhere yet (see createPostAction) -
      // nothing to prepend to the feed, just close the composer.
      if (wasScheduled) { onPosted?.(null); return }
      if (onPosted && 'postId' in result) onPosted('post' in result && result.post ? result.post : { id: result.postId })
    })
  }

  const activeMedia = media.filter(m => !m.error)
  const canAddMore = activeMedia.length < MAX_MEDIA

  const radius = 10
  const circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - Math.min(body.length / MAX_CHARS, 1) * circumference

  return (
    <div style={{
      padding: variant === 'fullscreen' ? '14px 0' : '14px 16px',
      borderBottom: variant === 'modal' ? '1px solid var(--color-border)' : undefined,
      display: 'flex',
      flexDirection: 'column',
      flex: variant === 'fullscreen' ? 1 : undefined,
      minHeight: variant === 'fullscreen' ? 0 : undefined,
    }}>
      {/* Top block: avatar + textarea + media */}
      <div style={{ display: 'flex', gap: 12 }}>
      {/* Avatar */}
      <div style={{
        width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
        background: authorAvatarUrl ? undefined : 'linear-gradient(135deg, var(--color-brand-dim), var(--color-brand))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, color: 'white',
        overflow: 'hidden',
      }}>
        {authorAvatarUrl
          ? <img src={authorAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : authorName.slice(0, 2).toUpperCase()
        }
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleTextChange}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handlePost() }}
          placeholder="Wetin dey happen? Share your take…"
          rows={2}
          style={{
            width: '100%', background: 'none', border: 'none', resize: 'none',
            outline: 'none', fontSize: 16,
            color: isOverLimit ? 'var(--color-error)' : 'var(--color-text-primary)',
            fontFamily: "'DM Sans', sans-serif", lineHeight: 1.55,
            caretColor: 'var(--color-brand)', minHeight: 52,
          }}
        />

        {/* Media previews */}
        {media.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: media.length === 1 ? '1fr' : 'repeat(2, 1fr)',
            gap: 4, borderRadius: 12, overflow: 'hidden',
            marginBottom: 10, maxHeight: 300,
          }}>
            {media.map(m => (
              <div key={m.tempId} style={{
                position: 'relative',
                aspectRatio: media.length === 1 ? '16/9' : '1/1',
                background: 'var(--color-surface-2)',
                overflow: 'hidden',
                gridColumn: media.length === 3 && media.indexOf(m) === 0 ? '1 / -1' : undefined,
              }}>
                {/* Preview */}
                {m.media_type === 'image' ? (
                  <img
                    src={m.localPreview || m.url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <video
                    src={m.localPreview || m.url}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    muted
                    playsInline
                  />
                )}

                {/* Uploading spinner overlay */}
                {m.uploading && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.55)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    <Loader2 size={24} color="white" style={{ animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>{m.progress ? `${m.progress}%` : 'Uploading…'}</span>
                  </div>
                )}

                {/* Error overlay */}
                {m.error && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(229,57,53,0.82)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    padding: '8px 10px', overflow: 'hidden',
                  }}>
                    <span style={{
                      fontSize: 12, color: 'white', textAlign: 'center',
                      wordBreak: 'break-word', lineHeight: 1.4,
                      display: '-webkit-box', WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {m.error}
                    </span>
                    <button
                      onClick={() => removeMedia(m.tempId)}
                      style={{
                        marginTop: 6, fontSize: 11, color: 'white',
                        background: 'rgba(255,255,255,0.2)', border: 'none',
                        borderRadius: 10, padding: '2px 8px', cursor: 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}

                {/* Remove button */}
                <button
                  onClick={() => removeMedia(m.tempId)}
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.7)', border: 'none',
                    cursor: 'pointer', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <X size={12} /> {error}
          </div>
        )}
      </div>
      </div>

      {/* Spacer - pushes audience line + toolbar to the very bottom of the
          screen in fullscreen mode, so the compose area actually stretches
          instead of everything bunching up at the top. No-op in modal
          variant (flex: 1 has nothing to grow within there). */}
      {variant === 'fullscreen' && <div style={{ flex: 1 }} />}

      <div style={variant === 'fullscreen' ? undefined : { marginLeft: 54 }}>
        {/* Audience - display-only for now, reply-permission settings aren't built yet */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 13, color: 'var(--color-brand)', fontWeight: 600 }}>
          <Globe size={14} />
          Everyone can reply
        </div>

        <div style={{ height: 1, background: 'var(--color-border)', margin: '8px 0' }} />

        {/* Selling toggle - no separate item field: the post's own text is
            the description, and it auto-fills the buyer's payment note
            (still editable by the buyer) - see pay-vendor-button.tsx. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag size={15} color={isSelling ? 'var(--color-brand)' : 'var(--color-text-muted)'} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              I&rsquo;m selling something
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsSelling(v => !v)}
            aria-pressed={isSelling}
            style={{
              width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
              background: isSelling ? 'var(--color-brand)' : 'var(--color-surface-3)',
              position: 'relative', transition: 'background 0.15s', flexShrink: 0, padding: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: isSelling ? 19 : 3,
              width: 16, height: 16, borderRadius: '50%', background: 'white',
              transition: 'left 0.15s',
            }} />
          </button>
        </div>
        {isSelling && (
          <p style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: -4, marginBottom: 10 }}>
            Buyers will see a Pay button on this post - write what you&rsquo;re selling above.
          </p>
        )}

        {scheduledAt && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
            fontSize: 12.5, color: 'var(--color-brand)', fontWeight: 600,
          }}>
            Will post on {formatScheduled(scheduledAt)}
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="composer-toolbar-icons" style={{ display: 'flex', gap: 2, overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 0 }}>
            {/* Media upload - one button, accepts photos and videos together */}
            <input
              ref={mediaInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/mov,video/avi"
              multiple
              style={{ display: 'none' }}
              onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
            />
            <ToolbarBtn
              icon={<ImageIcon size={18} />}
              label="Add photo or video"
              disabled={!canAddMore}
              onClick={() => mediaInputRef.current?.click()}
              title={canAddMore ? 'Add photos or videos' : `Max ${MAX_MEDIA} images per post`}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
            />
            <ToolbarBtn
              icon={<Camera size={18} />}
              label="Take photo or video"
              disabled={!canAddMore}
              onClick={() => cameraInputRef.current?.click()}
              title={canAddMore ? 'Take a photo or video' : `Max ${MAX_MEDIA} images per post`}
            />
            <ToolbarBtn icon={<Mic size={18} />} label="Voice" disabled title="Coming soon" onClick={() => {}} />
            <ToolbarBtn icon={<span style={{ fontSize: 10, fontWeight: 800, border: '1.5px solid currentColor', borderRadius: 4, padding: '1px 3px', lineHeight: 1 }}>GIF</span>} label="Add GIF" disabled title="Coming soon" onClick={() => {}} />
            <ToolbarBtn icon={<BarChart2 size={18} />} label="Add poll" disabled title="Coming soon" onClick={() => {}} />
            <ToolbarBtn icon={<MapPin size={18} />} label="Add location" disabled title="Coming soon" onClick={() => {}} />
            {/* Scheduling needs a live createPostAction round-trip (see
                handlePost) so it's not available offline. */}
            <SchedulePicker
              value={scheduledAt}
              onChange={setScheduledAt}
              disabled={networkStatus !== 'online'}
            />
          </div>
          <style>{`.composer-toolbar-icons::-webkit-scrollbar { display: none; }`}</style>

          {variant === 'modal' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Char counter */}
              {body.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width={26} height={26} style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx={13} cy={13} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={2.5} />
                    <circle cx={13} cy={13} r={radius} fill="none"
                      stroke={isOverLimit ? 'var(--color-error)' : isWarning ? 'var(--color-gold)' : 'var(--color-brand)'}
                      strokeWidth={2.5}
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeOffset}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 0.1s, stroke 0.2s' }}
                    />
                  </svg>
                  {isWarning && (
                    <span style={{ fontSize: 12, color: isOverLimit ? 'var(--color-error)' : 'var(--color-gold)', fontWeight: 700 }}>
                      {charsLeft}
                    </span>
                  )}
                </div>
              )}

              <div style={{ width: 1, height: 20, background: 'var(--color-border)' }} />

              {/* Post button */}
              <button
                onClick={handlePost}
                disabled={!canPost}
                style={{
                  background: canPost ? 'var(--color-brand)' : 'var(--color-surface-2)',
                  color: canPost ? 'white' : 'var(--color-text-muted)',
                  border: 'none', borderRadius: 20, padding: '8px 20px',
                  fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
                  cursor: canPost ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s, color 0.15s',
                  minHeight: 36,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {isPending && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
                {/* Media uploading is shown per-thumbnail (see the spinner
                    overlay above) - the button just stays disabled and
                    keeps its normal label instead of also claiming to be
                    "loading", which read as the post itself being stuck. */}
                {isPending ? (scheduledAt ? 'Scheduling…' : 'Posting…') : (scheduledAt ? 'Schedule' : 'Post')}
              </button>
            </div>
          ) : (
            // fullscreen - header owns the Post button; just show the char ring here when it matters
            body.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width={26} height={26} style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx={13} cy={13} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={2.5} />
                  <circle cx={13} cy={13} r={radius} fill="none"
                    stroke={isOverLimit ? 'var(--color-error)' : isWarning ? 'var(--color-gold)' : 'var(--color-brand)'}
                    strokeWidth={2.5}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeOffset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.1s, stroke 0.2s' }}
                  />
                </svg>
                {isWarning && (
                  <span style={{ fontSize: 12, color: isOverLimit ? 'var(--color-error)' : 'var(--color-gold)', fontWeight: 700 }}>
                    {charsLeft}
                  </span>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
})

export default PostComposer

function ToolbarBtn({ icon, label, disabled, onClick, title }: {
  icon: React.ReactNode
  label: string
  disabled: boolean
  onClick: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={label}
      style={{
        width: 36, height: 36, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--color-text-faint)' : 'var(--color-brand)',
        borderRadius: 8,
        transition: 'background 0.12s',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--color-brand-muted)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      {icon}
    </button>
  )
}