'use client'

/**
 * local-drafts.ts
 * ----------------
 * "Drafts" in the Drafts panel come from two places: scheduled posts
 * (already submitted, sitting server-side in the future - see
 * getScheduledPostsAction) and local drafts, which live entirely in this
 * file. A local draft is anything typed into the composer and closed
 * without sending - it's saved to localStorage, scoped per user id so it
 * can't leak across accounts on a shared device, and never sent anywhere.
 */

export interface LocalDraftMedia {
  url: string
  thumbnail_url?: string | null
  media_type: 'image' | 'video'
  width?: number
  height?: number
  duration_secs?: number | null
  size_bytes?: number
  cloudinary_id?: string
}

export interface LocalDraft {
  id: string
  body: string
  media: LocalDraftMedia[]
  isSelling: boolean
  updatedAt: string
}

const MAX_DRAFTS = 20

function storageKey(userId: string) {
  return `spup_drafts_${userId}`
}

export function loadDrafts(userId: string): LocalDraft[] {
  if (typeof window === 'undefined' || !userId) return []
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getDraft(userId: string, draftId: string): LocalDraft | null {
  return loadDrafts(userId).find(d => d.id === draftId) || null
}

// Upserts by id. Called on a debounce while typing and once more on close,
// so the latest keystrokes are never lost.
export function saveDraft(userId: string, draft: LocalDraft) {
  if (typeof window === 'undefined' || !userId) return
  try {
    const drafts = loadDrafts(userId).filter(d => d.id !== draft.id)
    drafts.unshift(draft)
    window.localStorage.setItem(storageKey(userId), JSON.stringify(drafts.slice(0, MAX_DRAFTS)))
  } catch {
    // Storage full or unavailable (private browsing, etc.) - the draft just
    // won't persist across a reload. Not worth surfacing to the user.
  }
}

export function deleteDraft(userId: string, draftId: string) {
  if (typeof window === 'undefined' || !userId) return
  try {
    const drafts = loadDrafts(userId).filter(d => d.id !== draftId)
    window.localStorage.setItem(storageKey(userId), JSON.stringify(drafts))
  } catch {
    // no-op
  }
}

export function hasMeaningfulContent(body: string, mediaCount: number): boolean {
  return body.trim().length > 0 || mediaCount > 0
}

export function newDraftId(): string {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
