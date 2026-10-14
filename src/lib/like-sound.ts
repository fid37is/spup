// src/lib/like-sound.ts
//
// A soft water-droplet "bloop" played when a post is liked. Synthesised with
// the Web Audio API, so there is no audio file to download or host. Browsers
// only allow sound after a tap/click, which is exactly when this is called.
//
// To let people turn it off later: localStorage 'spup-sound' = 'off'.

let ctx: AudioContext | null = null

export function playLikeSound() {
  if (typeof window === 'undefined') return
  try {
    if (window.localStorage.getItem('spup-sound') === 'off') return

    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    if (!ctx) ctx = new AC()
    if (ctx.state === 'suspended') void ctx.resume()

    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()

    // A water drop is a pure, low tone whose pitch rises very quickly as the
    // bubble resonates: ~380 Hz -> ~760 Hz in 60 ms, then it rings out softly.
    osc.type = 'sine'
    osc.frequency.setValueAtTime(380, t)
    osc.frequency.exponentialRampToValueAtTime(760, t + 0.06)
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.16)

    // Rounds off any edge so it stays gentle.
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(1400, t)
    filter.Q.setValueAtTime(0.5, t)

    // Very quiet (peak 0.045) with a tiny attack and a smooth, watery fade.
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.045, t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.24)
  } catch {
    // Sound is a nicety; never let it break a like.
  }
}