// src/lib/posting/media-upload.ts
//
// An upload that is NOT tied to a React component.
//
// Composers used to run uploads inside their own state, so closing the
// composer (or leaving the page) threw the upload away - which is why Post
// had to stay disabled until every file finished. Here an upload is a plain
// object (a "handle") that keeps running by itself. A composer can show its
// progress while the person types, and when they tap Post it simply hands the
// handles over to the background poster (see components/layout/posting-provider),
// which waits for whatever is still in flight and then publishes.
//
// Browser-only (compression and XHR upload), same as media-client.ts.

import { compressImageForUpload, createUploadQueue } from '@/lib/media-client'
import { uploadMedia, UploadCancelledError, type UploadResult } from '@/lib/upload-media'

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error'

export interface UploadHandle {
  readonly id: string
  readonly file: File
  readonly kind: 'image' | 'video'
  status: UploadStatus
  /** 0-100 for this file. */
  progress: number
  /** Bytes that will actually be sent (photos are compressed first). `file.size` until `sized`. */
  sentBytes: number
  /** True once compression has run and `sentBytes` is the real number. */
  sized: boolean
  result?: UploadResult
  error?: string
  /**
   * Settles when the upload finishes. Rejects with the failure, or with
   * UploadCancelledError if it was cancelled. Having no one awaiting it never
   * produces an "unhandled rejection".
   */
  readonly promise: Promise<UploadResult>
  cancel(): void
  /** Called after every change (progress, status). Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
}

interface StartOptions {
  /**
   * Runs after a photo has been compressed and right before it is sent.
   * Return a message to refuse the upload (e.g. the post would go over its
   * total size cap); the handle then fails with that message.
   */
  beforeSend?: (bytesToSend: number) => string | null
}

// Shared by every composer: a few uploads at a time, the rest wait their turn.
// With up to 4 files per post a burst of parallel uploads on a slow
// connection makes every one of them crawl (and time out).
const queue = createUploadQueue(3)

export function startMediaUpload(file: File, kind: 'image' | 'video', options: StartOptions = {}): UploadHandle {
  const listeners = new Set<() => void>()
  const controller = new AbortController()
  let cancelled = false

  const emit = () => { listeners.forEach(l => l()) }

  const handle = {
    id: `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    file,
    kind,
    status: 'queued' as UploadStatus,
    progress: 0,
    sentBytes: file.size,
    sized: false,
    result: undefined as UploadResult | undefined,
    error: undefined as string | undefined,
    promise: undefined as unknown as Promise<UploadResult>,
    cancel() {
      if (cancelled) return
      cancelled = true
      controller.abort()
      // A cancelled upload that is still waiting for its turn never starts
      // (see the check at the top of the queued task).
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }

  const promise = queue(async () => {
    if (cancelled) throw new UploadCancelledError('Upload cancelled')
    handle.status = 'uploading'
    emit()

    // Phone photos are often 3-8MB; shrink before sending (photos only).
    const toSend = kind === 'image' ? await compressImageForUpload(file) : file
    if (cancelled) throw new UploadCancelledError('Upload cancelled')

    handle.sentBytes = toSend.size
    handle.sized = true
    const refusal = options.beforeSend?.(toSend.size)
    if (refusal) throw new Error(refusal)

    // Straight to Cloudinary from the phone (signed by /api/upload/signature),
    // with real progress and automatic retry if the connection drops.
    const result = await uploadMedia(toSend, kind, pct => {
      handle.progress = pct
      emit()
    }, controller.signal)

    handle.result = result
    handle.progress = 100
    handle.status = 'done'
    emit()
    return result
  }).catch((err: unknown) => {
    handle.status = 'error'
    handle.error = err instanceof Error && err.message ? err.message : 'Upload failed'
    emit()
    throw err
  })

  // Swallow on a side branch so an upload nobody is waiting on can't raise an
  // unhandled-rejection warning; anyone who awaits `promise` still sees the error.
  promise.catch(() => {})

  ;(handle as { promise: Promise<UploadResult> }).promise = promise
  return handle as UploadHandle
}

export { UploadCancelledError }
