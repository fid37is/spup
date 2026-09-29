// src/lib/video-focus.ts
//
// One place that decides which video in the app is allowed to play / make
// sound, so two videos can never talk over each other.
//
//  1. Full-screen focus. While any MediaViewer is open, every inline feed video
//     is suspended (paused, and its scroll-autoplay observer stands down). When
//     the last viewer closes they resume. Counted, so stacked viewers are safe.
//
//  2. Audio focus. Only one inline video may have sound at a time: unmuting one
//     re-mutes whichever other one had sound.
//
// Module-level state + useSyncExternalStore: no provider to mount, and it works
// for the many independent PostCards on a page.

import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
function emit() { listeners.forEach(l => l()) }
function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

// ── Full-screen focus ─────────────────────────────────────────────────────────

let openViewers = 0

/** Call when a full-screen viewer opens. Returns the release function. */
export function acquireFullscreenVideoFocus(): () => void {
  openViewers += 1
  emit()
  let released = false
  return () => {
    if (released) return
    released = true
    openViewers = Math.max(0, openViewers - 1)
    emit()
  }
}

/** Non-reactive read, for use inside observers/callbacks. */
export function isInlineVideoSuspended(): boolean {
  return openViewers > 0
}

export function useInlineVideoSuspended(): boolean {
  return useSyncExternalStore(subscribe, () => openViewers > 0, () => false)
}

// ── Audio focus ───────────────────────────────────────────────────────────────

let audioOwner: string | null = null

export function claimInlineAudio(id: string) {
  if (audioOwner === id) return
  audioOwner = id
  emit()
}

export function releaseInlineAudio(id: string) {
  if (audioOwner !== id) return
  audioOwner = null
  emit()
}

/** The id of the inline video currently allowed to have sound (or null). */
export function useInlineAudioOwner(): string | null {
  return useSyncExternalStore(subscribe, () => audioOwner, () => null)
}
