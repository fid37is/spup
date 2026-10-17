// src/lib/timezone.ts
//
// Time zone helpers for the analytics page. Safe on server and client.
//
// Analytics days and "active times" are shown in the CREATOR'S own time zone, so
// "post around 7pm" means 7pm on their clock whichever country they are in. The
// page learns the time zone from the browser, keeps it in a cookie, and the server
// uses that cookie. Until the cookie exists it falls back to Nigeria time.

export const TZ_COOKIE = 'spup_tz'
export const DEFAULT_TZ = 'Africa/Lagos'

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** A usable zone from a cookie value, else Nigeria time. */
export function pickTimeZone(raw: string | undefined | null): string {
  if (!raw) return DEFAULT_TZ
  let v = raw
  try { v = decodeURIComponent(raw) } catch { /* keep raw */ }
  return isValidTimeZone(v) ? v : DEFAULT_TZ
}

/** 'YYYY-MM-DD' of an instant on the calendar of `tz`. */
export function localDay(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

/** "Africa/Lagos" -> "Lagos (WAT)" style label for the page. */
export function tzLabel(tz: string): string {
  const city = (tz.split('/').pop() ?? tz).replace(/_/g, ' ')
  try {
    const abbr = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value
    return abbr ? `${city} (${abbr})` : city
  } catch {
    return city
  }
}
