// src/lib/support-resources.ts
// Help resources shown when a post matches a "support" word rule (e.g. wording
// about self-harm). The screen is opt-out and non-punitive: the post is still
// published and nothing is added to the moderation queue.
//
// ⚠ Helpline numbers change. Different directories list different Nigerian
// numbers, so CALL EACH ONE before launch and re-check every few months.
// This is the only place the numbers live.

export interface SupportResource {
  name: string
  description: string
  /** Shown to the person. */
  display: string
  /** tel: value, digits only (with leading + for international). */
  tel: string
}

export const SUPPORT_RESOURCES: SupportResource[] = [
  {
    name: 'Emergency services',
    description: 'If you or someone else is in immediate danger',
    display: '112',
    tel: '112',
  },
  {
    name: 'SURPIN helpline',
    description: 'Free, 24 hours. Counsellors speak Hausa, Igbo and Yoruba',
    display: '0800 078 7746',
    tel: '08000787746',
  },
  {
    name: 'MANI crisis line',
    description: 'Free and confidential, 24/7',
    display: '0800 800 2000',
    tel: '08008002000',
  },
]

export const SUPPORT_EVENT = 'spup:support-resources'

/** Call after a post/reply is created when the server says `support: true`. */
export function showSupportResources() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SUPPORT_EVENT))
}
