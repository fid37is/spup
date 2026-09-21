// src/lib/user-agent.ts
//
// Tiny User-Agent reader for admin analytics: device class, OS and browser.
// No dependency; covers what Spup's audience actually uses (Android Chrome,
// Samsung Internet, Opera Mini, UC Browser, iPhone Safari, in-app browsers).
// Anything it can't place is reported as 'Other' / 'unknown' - never guessed.

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown'

export interface DeviceInfo {
  deviceType: DeviceType
  os: string
  browser: string
}

export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  const s = (ua ?? '').trim()
  if (!s) return { deviceType: 'unknown', os: 'unknown', browser: 'unknown' }

  // ── OS ────────────────────────────────────────────────────────────────────
  let os = 'Other'
  if (/Android/i.test(s)) os = 'Android'
  else if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS'
  else if (/CrOS/i.test(s)) os = 'ChromeOS'
  else if (/Windows/i.test(s)) os = 'Windows'
  else if (/Macintosh|Mac OS X/i.test(s)) os = 'macOS'
  else if (/Linux|X11/i.test(s)) os = 'Linux'

  // ── Device class ──────────────────────────────────────────────────────────
  let deviceType: DeviceType = 'unknown'
  if (/Opera Mini|Opera Mobi|IEMobile|Windows Phone|BlackBerry|BB10|KaiOS/i.test(s)) deviceType = 'mobile'
  else if (/iPad|Tablet/i.test(s)) deviceType = 'tablet'
  else if (/iPhone|iPod/i.test(s)) deviceType = 'mobile'
  else if (/Android/i.test(s)) deviceType = /Mobile/i.test(s) ? 'mobile' : 'tablet'
  else if (os === 'Windows' || os === 'macOS' || os === 'Linux' || os === 'ChromeOS') deviceType = 'desktop'

  // ── Browser (order matters: most specific first) ──────────────────────────
  let browser = 'Other'
  if (/FBAN|FBAV|FB_IAB/i.test(s)) browser = 'Facebook app'
  else if (/Instagram/i.test(s)) browser = 'Instagram app'
  else if (/TikTok|musical_ly|BytedanceWebview/i.test(s)) browser = 'TikTok app'
  else if (/Opera Mini/i.test(s)) browser = 'Opera Mini'
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera'
  else if (/UCBrowser|UCWEB/i.test(s)) browser = 'UC Browser'
  else if (/SamsungBrowser/i.test(s)) browser = 'Samsung Internet'
  else if (/Edg(e|A|iOS)?\//i.test(s)) browser = 'Edge'
  else if (/Firefox|FxiOS/i.test(s)) browser = 'Firefox'
  else if (/; wv\)/i.test(s) && /Android/i.test(s)) browser = 'Android WebView'
  else if (/CriOS|Chrome\//i.test(s)) browser = 'Chrome'
  else if (/Safari\//i.test(s) && /Version\//i.test(s)) browser = 'Safari'

  return { deviceType, os, browser }
}
