// src/lib/haptics.ts
//
// A tiny "tick" for gestures (swipe-to-reply reaching its threshold, long-press opening the message menu).
// Native app: the Capacitor Haptics plugin. Browser: navigator.vibrate where it exists (Android Chrome);
// everywhere else it is a silent no-op. Never throws.

export function lightHaptic(): void {
  try {
    if (typeof window === 'undefined') return
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (cap?.isNativePlatform?.()) {
      void import('@capacitor/haptics')
        .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
        .catch(() => { /* plugin missing: fine */ })
      return
    }
    navigator.vibrate?.(10)
  } catch { /* ignore */ }
}