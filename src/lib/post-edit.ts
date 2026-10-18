// src/lib/post-edit.ts
//
// Rules for editing a published post. Lives outside actions/posts.ts because a
// 'use server' file may only export async functions, and the card needs these
// numbers too (to hide the Edit button once the window has closed).
//
// 15 minutes, up to 5 edits: the same window Threads uses. X allows 1 hour (Premium only).

export const EDIT_WINDOW_MINUTES = 15
export const EDIT_WINDOW_MS = EDIT_WINDOW_MINUTES * 60 * 1000
export const MAX_POST_EDITS = 5

/** Extra time the server allows for a slow connection or a few seconds of clock difference. */
export const EDIT_GRACE_MS = 10 * 1000

/** Milliseconds left to edit a post made at `createdAt` (0 once closed). */
export function editTimeLeftMs(createdAt: string, now = Date.now()): number {
  return Math.max(0, Date.parse(createdAt) + EDIT_WINDOW_MS - now)
}

export function isWithinEditWindow(createdAt: string, now = Date.now()): boolean {
  return editTimeLeftMs(createdAt, now) > 0
}
