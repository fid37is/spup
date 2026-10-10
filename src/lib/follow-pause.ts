// Wording for the follow-spam pause. Shared by the server (follows.ts) and the
// phone/browser (engagement-sync.ts), so the same person sees the same message
// whichever side answers - and every retry shows the time that is LEFT, not the
// time the pause started with.

/** "less than a minute", "6 minutes", "1 hour", "2 hours 15 minutes" */
export function formatPauseRemaining(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60_000))
  if (totalMin < 2 && ms < 60_000) return 'less than a minute'
  if (totalMin < 60) return `${totalMin} minute${totalMin === 1 ? '' : 's'}`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  const hours = `${h} hour${h === 1 ? '' : 's'}`
  return m ? `${hours} ${m} minute${m === 1 ? '' : 's'}` : hours
}

export function followPausedMessage(until: Date | number): string {
  const ms = (typeof until === 'number' ? until : until.getTime()) - Date.now()
  return `You're following people too quickly, so following is paused. Try again in ${formatPauseRemaining(ms)}.`
}
