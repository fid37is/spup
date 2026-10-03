// src/lib/announcements.ts
//
// Rules and helpers for announcement banners, shared by the admin form (instant
// feedback), the server action (the check that actually counts), the layout,
// the live-poll endpoint and the banner components. No server-only imports, so
// the client can use it too.

export const ANNOUNCEMENT_KINDS = ['feature', 'maintenance'] as const
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number]

export const ANNOUNCEMENT_LIMITS = { title: 60, body: 200, ctaLabel: 24, ctaUrl: 500, remindHours: 168 } as const

export const KIND_LABELS: Record<AnnouncementKind, string> = {
  feature: 'New feature',
  maintenance: 'Maintenance',
}

/** Choices offered in the admin form for "bring it back after dismissal". */
export const REMIND_CHOICES: { value: number | null; label: string }[] = [
  { value: null, label: 'Never - dismissing is final' },
  { value: 3, label: 'After 3 hours' },
  { value: 6, label: 'After 6 hours' },
  { value: 12, label: 'After 12 hours' },
  { value: 24, label: 'After 24 hours' },
]

/** What the app needs to draw and schedule a banner. */
export interface FeedAnnouncement {
  id: string
  kind: AnnouncementKind
  title: string
  body: string
  cta_label: string | null
  cta_url: string | null
  /** When the banner stops being live (ISO), if it has an end. */
  ends_at: string | null
  /** Hours before a dismissed banner is shown again; null = never. */
  remind_after_hours: number | null
}

export interface AnnouncementInput {
  kind: AnnouncementKind
  title: string
  body: string
  ctaLabel?: string
  ctaUrl?: string
  /** ISO timestamp. Omitted = show immediately. */
  startsAt?: string
  /** ISO timestamp. Omitted = stays up until an admin ends it. */
  endsAt?: string
  /** Omitted/null = a dismissal is final. */
  remindAfterHours?: number | null
}

/** A button may open a page inside Spup ("/wallet") or an https link. Nothing else. */
export function isValidCtaUrl(url: string): boolean {
  if (url.startsWith('/')) return !url.startsWith('//') && !url.includes('\\') && !/\s/.test(url)
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/** Returns a message for the first problem found, or null when the input is fine. */
export function validateAnnouncementInput(input: AnnouncementInput, now = Date.now()): string | null {
  if (!ANNOUNCEMENT_KINDS.includes(input.kind)) return 'Pick a type'

  const title = input.title?.trim() ?? ''
  const body = input.body?.trim() ?? ''
  if (!title) return 'Add a title'
  if (title.length > ANNOUNCEMENT_LIMITS.title) return `Title is over ${ANNOUNCEMENT_LIMITS.title} characters`
  if (!body) return 'Add a message'
  if (body.length > ANNOUNCEMENT_LIMITS.body) return `Message is over ${ANNOUNCEMENT_LIMITS.body} characters`

  const label = input.ctaLabel?.trim() ?? ''
  const url = input.ctaUrl?.trim() ?? ''
  if (label || url) {
    if (!label || !url) return 'A button needs both a label and a link'
    if (label.length > ANNOUNCEMENT_LIMITS.ctaLabel) return `Button label is over ${ANNOUNCEMENT_LIMITS.ctaLabel} characters`
    if (url.length > ANNOUNCEMENT_LIMITS.ctaUrl || !isValidCtaUrl(url)) {
      return 'Button link must start with / (a page in Spup) or https://'
    }
  }

  const starts = input.startsAt ? Date.parse(input.startsAt) : now
  if (Number.isNaN(starts)) return 'Start time is not valid'
  if (input.endsAt) {
    const ends = Date.parse(input.endsAt)
    if (Number.isNaN(ends)) return 'End time is not valid'
    if (ends <= now) return 'End time is already in the past'
    if (ends <= starts) return 'End time must be after the start time'
  }

  const remind = input.remindAfterHours
  if (remind !== undefined && remind !== null) {
    if (!Number.isInteger(remind) || remind < 1 || remind > ANNOUNCEMENT_LIMITS.remindHours) {
      return `Reminder must be a whole number of hours, 1 to ${ANNOUNCEMENT_LIMITS.remindHours}`
    }
  }
  return null
}

// ── Remembering what a person has dismissed, and when ───────────────────────
// A cookie, so the server can leave a dismissed banner out of the first paint
// (no flash), and so the time of the dismissal survives - which is what lets a
// banner come back after its reminder interval. Format: "<id>~<minutes, base36>"
// entries joined by ".". An entry without a time (written by the first version
// of this feature) counts as a final dismissal.
export const DISMISSED_COOKIE = 'spup_dismissed_announcements'
const ENTRY_SEPARATOR = '.'
const TIME_SEPARATOR = '~'
const REMEMBER_LAST = 20
const ID_RE = /^[0-9a-f-]{36}$/i
/** "Dismissed at" for legacy entries: so far in the future that no reminder interval ever elapses. */
const FINAL = 8.64e15

/** id -> when it was dismissed (ms since epoch). */
export type DismissedMap = Record<string, number>

export function parseDismissed(raw: string | undefined | null): DismissedMap {
  const out: DismissedMap = {}
  if (!raw) return out
  for (const entry of raw.split(ENTRY_SEPARATOR)) {
    const [id, stamp] = entry.split(TIME_SEPARATOR)
    if (!id || !ID_RE.test(id)) continue
    const minutes = stamp ? parseInt(stamp, 36) : NaN
    out[id] = Number.isFinite(minutes) ? minutes * 60_000 : FINAL
  }
  return out
}

/** Records a dismissal, keeping only the most recent ones. */
export function addDismissed(current: DismissedMap, id: string, at: number): DismissedMap {
  const entries = Object.entries({ ...current, [id]: at }).sort((a, b) => a[1] - b[1]).slice(-REMEMBER_LAST)
  return Object.fromEntries(entries)
}

export function serializeDismissed(map: DismissedMap): string {
  return Object.entries(map)
    .map(([id, at]) => (at >= FINAL ? id : `${id}${TIME_SEPARATOR}${Math.floor(at / 60_000).toString(36)}`))
    .join(ENTRY_SEPARATOR)
}

/** True while a dismissal still applies: always, unless the announcement has a reminder interval that has passed. */
function isStillDismissed(a: FeedAnnouncement, dismissed: DismissedMap, now: number): boolean {
  const at = dismissed[a.id]
  if (at === undefined) return false
  if (!a.remind_after_hours) return true
  return now - at < a.remind_after_hours * 3_600_000
}

/**
 * The one banner to show right now. Expired ones and still-dismissed ones are
 * skipped; maintenance goes first (it is time-sensitive), then the newest
 * feature announcement. `rows` is expected newest-first.
 */
export function pickAnnouncement(rows: FeedAnnouncement[], dismissed: DismissedMap, now: number): FeedAnnouncement | null {
  const rank: Record<AnnouncementKind, number> = { maintenance: 0, feature: 1 }
  return rows
    .filter(r => !(r.ends_at && Date.parse(r.ends_at) <= now))
    .filter(r => !isStillDismissed(r, dismissed, now))
    .sort((a, b) => rank[a.kind] - rank[b.kind])[0] ?? null
}
