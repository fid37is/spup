// src/lib/autoplay.ts
//
// One place that knows how the "Autoplay videos" setting is stored and what it
// means. The settings page saves the choice to localStorage under
// AUTOPLAY_STORAGE_KEY ('always' | 'wifi' | 'never') and to the profile; the
// feed reads it from here at the moment a video scrolls into view, so a
// change takes effect immediately and network changes are respected.

export type AutoplayPreference = 'always' | 'wifi' | 'never'

/** Same key settings-client writes to. */
export const AUTOPLAY_STORAGE_KEY = 'spup_autoplay'

const DEFAULT_PREFERENCE: AutoplayPreference = 'wifi' // matches the settings page default

export function isAutoplayPreference(v: unknown): v is AutoplayPreference {
  return v === 'always' || v === 'wifi' || v === 'never'
}

export function getAutoplayPreference(): AutoplayPreference {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCE
  try {
    const stored = window.localStorage.getItem(AUTOPLAY_STORAGE_KEY)
    return isAutoplayPreference(stored) ? stored : DEFAULT_PREFERENCE
  } catch {
    return DEFAULT_PREFERENCE
  }
}

/**
 * Should a feed video start playing on its own right now?
 *  - 'never'  -> no, the person taps play
 *  - 'always' -> yes (always muted - browsers require it)
 *  - 'wifi'   -> yes, unless the device reports a cellular connection or Data
 *                Saver. Safari/iOS expose no connection info, so there it can't
 *                tell mobile data from Wi-Fi and behaves like 'always'.
 */
export function shouldAutoplay(): boolean {
  const pref = getAutoplayPreference()
  if (pref === 'never') return false
  if (pref === 'always') return true

  const conn = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection
    : undefined
  if (!conn) return true
  if (conn.saveData) return false
  if (conn.type === 'cellular') return false
  return true
}