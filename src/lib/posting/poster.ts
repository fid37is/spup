// src/lib/posting/poster.ts
//
// Sends posts in the background so the composer never has to stay open.
//
// A composer used to do everything itself - upload, then `await
// createPostAction`, then close - so it had to stay open (Post button
// spinning) until the very end. Now it only gathers what the person wrote,
// hands it to `startPost` and closes straight away. This module then:
//
//   1. checks the text against the rules BEFORE sending anything (a post that
//      would be refused costs no data and leaves nothing on the server), then
//      uploads the photos/videos - they are only sent now, after Post was tapped
//      (a file picked in the composer stays on the device until then),
//   2. publishes with createPostAction,
//   3. drives the progress line at the top of the screen,
//   4. shows a toast when it's sent (with a View button) - or, if something
//      went wrong, a toast with Retry. Either way the person's words AND their
//      unsent photos/videos are saved to Drafts so nothing is lost; a post the
//      rules refuse goes straight to Drafts to be edited and sent again.
//
// It is plain TypeScript with no React in it. The provider
// (components/layout/posting-provider) creates one poster for the whole app
// shell, which is what lets a post keep going while the person navigates.

import { createPostAction, precheckPostAction } from '@/lib/actions'
import { showSupportResources } from '@/lib/support-resources'
import { formatScheduled } from '@/components/feed/schedule-picker'
import { deleteDraft, saveDraft, hasMeaningfulContent } from '@/lib/local-drafts'
import { syncDraftFiles } from '@/lib/draft-files'
import { MAX_POST_MEDIA_BYTES, POST_MEDIA_TOO_BIG } from '@/lib/media-limits'
import { queueOfflinePost, registerBackgroundSync } from '@/lib/offline-post-queue'
import { publishFeedEvent, stashJustPosted } from '@/lib/feed-local-events'
import { startMediaUpload, type UploadHandle } from '@/lib/posting/media-upload'
import type { ProgressStore, TrackedJob } from '@/lib/posting/progress-store'
import type { UploadResult } from '@/lib/upload-media'
import type { FeedPost } from '@/lib/actions/feed'
import type { ToastAction } from '@/components/layout/toast'

// ── What a composer hands over ───────────────────────────────────────────────

export interface PostJobMedia {
  /** Any stable key for this item (the composer's own id for it). */
  key: string
  kind: 'image' | 'video'
  /** The original file. The poster uploads from this when Post is tapped; also used to retry and for the offline queue. */
  file?: File
  /** An upload already running for this item (set by the poster itself). */
  handle?: UploadHandle
  /** Already uploaded (finished before Post, or restored from a draft). */
  result?: UploadResult
}

export interface PostJobResult {
  postId?: string
  /** The fully hydrated post, when the server returned one. */
  post?: unknown
  scheduled: boolean
}

export interface PostJobInput {
  body?: string
  parentPostId?: string
  /** The post being quoted. A quote is text only: no media, scheduling or selling. */
  quotedPostId?: string
  isSelling?: boolean
  /** ISO time. Only for original posts. */
  scheduledAt?: string
  media: PostJobMedia[]
  /**
   * Hold the raw files in the offline queue instead of uploading now (the
   * person is offline). The queue replays the post once they're back.
   */
  offline?: boolean
  /** The local draft this post came from: deleted once sent, refreshed if sending fails. */
  draft?: { userId: string; id: string }
  /** Where the toast's View button goes. Defaults to the new post's own page. */
  viewHref?: string
  /**
   * Runs once the post is live (not for scheduled/offline posts) - for a
   * screen that wants to react itself, e.g. slot a new reply into a thread.
   * When set, the poster does not refresh the page for a reply.
   */
  onComplete?: (result: PostJobResult) => void
}

// ── Internals ────────────────────────────────────────────────────────────────

/** An upload problem whose message is already written for the person to read. */
class UploadError extends Error {}

export interface PostJob extends TrackedJob {
  input: PostJobInput
  phase: 'uploading' | 'publishing'
}

export interface PosterDeps {
  router: () => { push(href: string): void; refresh(): void }
  pathname: () => string
  toast: () => {
    success(message: string, duration?: number, action?: ToastAction): void
    error(message: string, duration?: number, action?: ToastAction): void
  }
  t: () => (key: string, vars?: Record<string, string | number>) => string
}

/** Progress bands: uploads fill 2%-90%, publishing eases from there toward ~96%, success jumps to 100%. */
const UPLOAD_START = 2
const UPLOAD_END = 90
const TEXT_ONLY_START = 20
const PUBLISH_CEILING = 96
/** How long a failed post stays retryable (matches the error toast's lifetime). */
const FAILED_TOAST_MS = 10_000

export function createPoster(store: ProgressStore<PostJob>, deps: PosterDeps) {
  function startPost(input: PostJobInput) {
    const job: PostJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'running',
      phase: 'uploading',
      progress: startingProgress(input),
      input,
    }
    store.add(job)
    void run(job)
  }

  function retry(id: string) {
    const job = store.get(id)
    if (!job || job.status !== 'failed') return
    job.status = 'running'
    job.phase = 'uploading'
    job.progress = startingProgress(job.input)
    store.touch()
    void run(job)
  }

  async function run(job: PostJob) {
    const { input } = job
    const unsubscribe: Array<() => void> = []
    let stopTrickle = () => {}

    try {
      if (input.offline) {
        await queueForLater(job)
        return
      }

      // 0. Before any file leaves the device: would this post be refused anyway?
      //    (blocked words, an account that cannot post). If so nothing is uploaded.
      if (input.media.some(m => !m.result)) {
        let check: Awaited<ReturnType<typeof precheckPostAction>>
        try {
          check = await precheckPostAction({ body: input.body })
        } catch {
          throw new UploadError(deps.t()('composer.upload_failed'))
        }
        if ('error' in check && check.error) {
          const code = (check as { code?: string }).code
          fail(job, check.error, code !== 'suspended' && code !== 'content_blocked', undefined, code === 'content_blocked')
          return
        }
      }

      // 1. Every item must be uploading (or already uploaded). On a retry,
      //    items that finished the first time are kept; only the failed ones
      //    start again, from their original file.
      for (const item of input.media) {
        if (item.result) continue
        if (!item.handle || item.handle.status === 'error') {
          if (!item.file) throw new UploadError(deps.t()('composer.upload_failed'))
          item.handle = startMediaUpload(item.file, item.kind, {
            // Everything in one post can total MAX_POST_MEDIA_BYTES (photos are counted
            // after compression, so this can only be checked here, as each one is sized).
            beforeSend: bytes => {
              let others = 0
              for (const o of input.media) {
                if (o === item) continue
                if (o.result) others += o.result.size_bytes ?? 0
                else if (o.handle?.sized && o.handle.status !== 'error') others += o.handle.sentBytes
              }
              return others + bytes > MAX_POST_MEDIA_BYTES ? POST_MEDIA_TOO_BIG : null
            },
          })
        }
        unsubscribe.push(item.handle.subscribe(() => trackUploads(job)))
      }
      trackUploads(job)

      const uploaded = await Promise.all(input.media.map(async item => {
        if (item.result) return item.result
        const result = await item.handle!.promise
        item.result = result
        return result
      }))

      // 2. Publish.
      stopTrickle = startTrickle(job)
      const result = await createPostAction({
        body: input.body?.trim() || undefined,
        parent_post_id: input.parentPostId,
        quoted_post_id: input.quotedPostId,
        is_selling: input.parentPostId ? undefined : (input.isSelling || undefined),
        scheduled_at: input.parentPostId ? undefined : (input.scheduledAt || undefined),
        media: uploaded.length > 0 ? uploaded.map(m => ({
          url: m.url,
          thumbnail_url: m.thumbnail_url,
          media_type: m.media_type,
          width: m.width ?? undefined,
          height: m.height ?? undefined,
          duration_secs: m.duration_secs,
          size_bytes: m.size_bytes,
          cloudinary_id: m.cloudinary_id,
        })) : undefined,
      })
      stopTrickle()

      if ('error' in result && result.error) {
        const code = (result as { code?: string }).code
        // An unsafe link can't be fixed by trying again: no Retry, but an Appeal button.
        if (code === 'link_blocked') {
          fail(job, result.error, false, (result as { appealUrl?: string }).appealUrl ?? '/contact?topic=link-appeal')
          return
        }
        // Neither a suspension nor a blocked wording changes by trying again: no Retry button.
        fail(job, result.error, code !== 'suspended' && code !== 'content_blocked', undefined, code === 'content_blocked')
        return
      }
      succeed(job, {
        postId: 'postId' in result ? result.postId : undefined,
        post: 'post' in result ? result.post : undefined,
        scheduled: 'scheduled' in result && !!result.scheduled,
        scheduledFor: 'scheduledFor' in result ? result.scheduledFor : undefined,
        support: 'support' in result && !!result.support,
      })
    } catch (err) {
      // An upload failure already says what happened ("your connection
      // dropped..."). Anything else (the request itself failing) gets the
      // generic line rather than a raw "Failed to fetch".
      const detail = !input.offline && (err instanceof UploadError || job.phase === 'uploading')
        ? (err instanceof Error ? err.message : '')
        : ''
      fail(job, detail)
    } finally {
      unsubscribe.forEach(u => u())
      stopTrickle()
    }
  }

  // ── Progress ───────────────────────────────────────────────────────────────

  function startingProgress(input: PostJobInput) {
    return input.media.length > 0 ? UPLOAD_START : TEXT_ONLY_START
  }

  /** Uploads weigh by size, so one big video doesn't look the same as a tiny photo. */
  function trackUploads(job: PostJob) {
    if (job.phase !== 'uploading') return
    let total = 0
    let done = 0
    for (const m of job.input.media) {
      const weight = m.handle?.sentBytes ?? m.result?.size_bytes ?? m.file?.size ?? 1
      const fraction = m.result ? 1 : m.handle ? m.handle.progress / 100 : 0
      total += weight
      done += weight * fraction
    }
    const fraction = total > 0 ? done / total : 1
    // Never move backwards (a retried chunk resets its own percentage).
    job.progress = Math.max(job.progress, UPLOAD_START + fraction * (UPLOAD_END - UPLOAD_START))
    store.touch()
  }

  /** The publish step is one request with no progress of its own: ease toward the end so the line keeps moving. */
  function startTrickle(job: PostJob) {
    job.phase = 'publishing'
    job.progress = Math.max(job.progress, job.input.media.length > 0 ? UPLOAD_END : 35)
    store.touch()
    const timer = setInterval(() => {
      job.progress += (PUBLISH_CEILING - job.progress) * 0.12
      store.touch()
    }, 250)
    return () => clearInterval(timer)
  }

  // ── Outcomes ───────────────────────────────────────────────────────────────

  function finish(job: PostJob) {
    job.phase = 'publishing'
    job.progress = 100
    job.status = 'done'
    store.touch()
    // Linger a beat so the line visibly reaches the end before it fades.
    setTimeout(() => store.remove(job.id), 700)
  }

  function succeed(job: PostJob, r: {
    postId?: string
    post?: unknown
    scheduled: boolean
    scheduledFor?: string
    support: boolean
  }) {
    const { input } = job
    const t = deps.t()
    finish(job)

    if (input.draft) deleteDraft(input.draft.userId, input.draft.id)
    if (r.support) showSupportResources()

    const isReply = !!input.parentPostId

    if (r.scheduled && r.scheduledFor) {
      // Not visible anywhere yet, so there's nothing to View.
      deps.toast().success(t('composer.scheduled_for', { time: formatScheduled(r.scheduledFor) }))
    } else {
      const href = input.viewHref ?? (r.postId ? `/post/${r.postId}` : undefined)
      // "View" would only reload the page they are already looking at.
      const alreadyThere = href !== undefined && deps.pathname() === href
      deps.toast().success(
        isReply ? t('composer.reply_sent') : input.quotedPostId ? t('post.quote_posted') : t('composer.post_sent'),
        6000,
        href && !alreadyThere ? { label: t('composer.view'), onClick: () => deps.router().push(href) } : undefined,
      )
    }

    // Make the new post show up wherever the person is now.
    if (!r.scheduled) {
      if (isReply) {
        // A caller that takes the new reply itself (onComplete) skips the refresh - unless the
        // server didn't send the post back, in which case a refresh is the only way it shows up.
        if (!(input.onComplete && r.post) && deps.pathname().startsWith('/post/')) deps.router().refresh()
      } else {
        const delivered = r.post ? publishFeedEvent({ type: 'post-created', post: r.post as FeedPost }) > 0 : false
        if (!delivered) {
          // No feed on screen: park it for the next time the feed opens, and
          // refresh whatever page this is (e.g. their own profile).
          if (r.post) stashJustPosted(r.post)
          deps.router().refresh()
        }
      }
      try { input.onComplete?.({ postId: r.postId, post: r.post, scheduled: false }) } catch { /* a screen's own handler must not break posting */ }
    }
  }

  function fail(job: PostJob, detail: string, retryable = true, appealUrl?: string, blocked = false) {
    const { input } = job
    // An upload refused for a suspension arrives as plain text; treat it the same way.
    if (/^Your account is suspended/.test(detail)) retryable = false
    const t = deps.t()
    job.status = 'failed'
    store.touch()

    // Keep what the person wrote - and their photos/videos that were never sent, which
    // go back to the device-side store - so they can edit the post and send it again.
    // Replies aren't tracked in the Drafts panel (same rule the composer's own
    // autosave follows), so only new posts.
    if (input.draft && !input.parentPostId) {
      const uploaded = input.media.flatMap(m => (m.result ? [m.result] : []))
      const held = input.media.filter(m => !m.result && m.file)
      const body = input.body ?? ''
      if (hasMeaningfulContent(body, uploaded.length + held.length)) {
        void syncDraftFiles(input.draft.id, held.map(m => ({ key: m.key, blob: m.file!, name: m.file!.name })))
        saveDraft(input.draft.userId, {
          id: input.draft.id,
          body,
          heldMedia: held.map(m => ({ key: m.key, media_type: m.kind, size_bytes: m.file!.size })),
          media: uploaded.map(m => ({
            url: m.url,
            thumbnail_url: m.thumbnail_url,
            media_type: m.media_type,
            width: m.width ?? undefined,
            height: m.height ?? undefined,
            duration_secs: m.duration_secs,
            size_bytes: m.size_bytes,
            cloudinary_id: m.cloudinary_id,
          })),
          isSelling: !!input.isSelling,
          updatedAt: new Date().toISOString(),
        })
      }
    }

    const fallback = input.parentPostId ? t('composer.reply_failed') : t('composer.post_failed')
    if (blocked && input.draft && !input.parentPostId) {
      // Refused for what it says: nothing was uploaded. It is in Drafts, ready to edit.
      deps.toast().error(t('composer.blocked_to_drafts', { message: detail || fallback }), 9000)
    } else if (retryable) {
      deps.toast().error(detail || fallback, FAILED_TOAST_MS, { label: t('composer.retry'), onClick: () => retry(job.id) })
    } else if (appealUrl) {
      // A blocked link: say so, and offer the appeal page.
      deps.toast().error(t('links.cant_share'), 9000, { label: t('links.appeal'), onClick: () => deps.router().push(appealUrl) })
    } else {
      // Nothing to retry: just say why, and until when. Long enough to read the date.
      deps.toast().error(detail || fallback, 6000)
    }

    // After the toast is gone there's no way to retry, so stop holding the files.
    setTimeout(() => { if (job.status === 'failed') store.remove(job.id) }, FAILED_TOAST_MS + 500)
  }

  /** Offline: nothing can upload, so park the raw files + text in the offline queue (it posts them once back online). */
  async function queueForLater(job: PostJob) {
    const { input } = job
    // Anything that started uploading before the connection dropped would
    // only waste data now - the queue re-uploads from the original files.
    input.media.forEach(m => m.handle?.cancel())
    const media = input.media.flatMap(m => (m.file ? [{ blob: m.file, mediaType: m.kind, name: m.key }] : []))

    job.progress = 40
    store.touch()
    await queueOfflinePost({ body: input.body?.trim() || null, isSelling: !!input.isSelling, media })
    registerBackgroundSync()

    finish(job)
    if (input.draft) deleteDraft(input.draft.userId, input.draft.id)
    deps.toast().success(deps.t()('composer.queued_offline'))
  }

  return { startPost }
}