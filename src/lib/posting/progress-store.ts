// src/lib/posting/progress-store.ts
//
// Tracks the posts being sent in the background and boils them down to the one
// number the top-of-screen progress line shows. Kept as a tiny external store
// (read with useSyncExternalStore) so a progress tick re-renders only the bar,
// never the whole app tree the provider wraps.

export interface TrackedJob {
  id: string
  /** running: in flight. done: finished, lingering a moment so the bar can reach 100%. failed: waiting for a retry. */
  status: 'running' | 'done' | 'failed'
  /** 0-100 */
  progress: number
}

export interface BarState {
  visible: boolean
  /** 0-100, the average over every job the bar is currently showing. */
  value: number
}

const HIDDEN: BarState = { visible: false, value: 0 }

export class ProgressStore<J extends TrackedJob> {
  private jobs = new Map<string, J>()
  private listeners = new Set<() => void>()
  private snapshot: BarState = HIDDEN

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot = (): BarState => this.snapshot
  getServerSnapshot = (): BarState => HIDDEN

  get(id: string): J | undefined { return this.jobs.get(id) }

  add(job: J) {
    this.jobs.set(job.id, job)
    this.touch()
  }

  remove(id: string) {
    if (this.jobs.delete(id)) this.touch()
  }

  hasRunning(): boolean {
    for (const job of this.jobs.values()) if (job.status === 'running') return true
    return false
  }

  /** Call after mutating a job (status or progress) so subscribers recompute. */
  touch() {
    // A failed job is waiting on a toast's Retry button - it isn't "in
    // progress", so it must not keep the bar on screen.
    const shown = [...this.jobs.values()].filter(j => j.status !== 'failed')
    const next: BarState = shown.length === 0
      ? HIDDEN
      : { visible: true, value: Math.round(shown.reduce((sum, j) => sum + j.progress, 0) / shown.length) }
    if (next.visible === this.snapshot.visible && next.value === this.snapshot.value) return
    this.snapshot = next
    this.listeners.forEach(l => l())
  }
}
