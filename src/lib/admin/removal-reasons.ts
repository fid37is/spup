// src/lib/admin/removal-reasons.ts
//
// Shared by the admin "remove post" UI and adminDeletePostAction. Lives outside
// lib/actions/admin.ts because a 'use server' file may only export async functions.

/** The reason is shown to the post's author, so it must be a real sentence. */
export const REMOVAL_REASON_MIN = 5
export const REMOVAL_REASON_MAX = 300

/** One-tap starting points; the admin can edit the text afterwards. */
export const REMOVAL_REASON_PRESETS: { label: string; text: string }[] = [
  { label: 'Harassment / hate', text: 'It contained harassment or hateful content, which is not allowed on Spup.' },
  { label: 'Spam / scam',       text: 'It looked like spam or a scam, which is not allowed on Spup.' },
  { label: 'Adult content',     text: 'It contained adult or sexual content, which is not allowed on Spup.' },
  { label: 'Violence / threats', text: 'It contained violence or threats, which is not allowed on Spup.' },
  { label: 'Misleading',        text: 'It shared misleading or false information that could cause harm.' },
  { label: 'Impersonation',     text: 'It pretended to be another person or brand.' },
]
