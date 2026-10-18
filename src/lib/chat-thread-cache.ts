// src/lib/chat-thread-cache.ts
//
// Last-known messages of each conversation, kept on the device so opening a chat paints the
// thread straight away (like WhatsApp) and then catches up in the background - instead of
// waiting on the server and then decrypting every bubble from scratch.
//
//  - memory (`mem`)       : survives in-app navigation (Chat list -> thread -> back -> thread ...)
//  - storage (localStorage): survives closing/reopening the app, newest MAX_ROWS per thread,
//                            most recent MAX_THREADS threads
//  - plainTextCache        : decrypted text by its ciphertext. MEMORY ONLY, never written to
//                            storage - same rule as the chat list's decrypted previews
//                            (lib/chat-list-cache.ts). It is rebuilt from the local key, so the
//                            PIN gate and end-to-end encryption are not weakened: what is stored on
//                            the device is exactly what the server already holds (ciphertext).
//
// Belongs to one account: ChatCacheGuard claims it on mount and clears it on sign-out.

import type { MessageRow } from '@/lib/chat-queries'

const PREFIX = 'spup:chat-thread:v1:'
const INDEX_KEY = 'spup:chat-thread-index:v1'
const MAX_ROWS = 50
const MAX_THREADS = 25
const PERSIST_DELAY_MS = 500

export interface ThreadSnapshot {
  messages: MessageRow[]      // oldest -> newest, confirmed rows only
  hasMore: boolean            // older messages exist beyond what is cached
  savedAt: number
}

const mem = new Map<string, ThreadSnapshot>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** Decrypted text by ciphertext (unique per message). Memory only - never persisted. */
export const plainTextCache = new Map<string, string>()

const isBrowser = () => typeof window !== 'undefined'
const keyFor = (userId: string, conversationId: string) => `${PREFIX}${userId}:${conversationId}`

/** Drops the UI-only fields (_optimistic, _failed, _key) so only server rows are stored. */
function strip(row: MessageRow): MessageRow {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('_')) out[k] = v
  return out as unknown as MessageRow
}

function readIndex(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(INDEX_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

function writeIndex(keys: string[]) {
  try { window.localStorage.setItem(INDEX_KEY, JSON.stringify(keys)) } catch { /* quota / private mode */ }
}

function touchIndex(key: string) {
  const index = readIndex().filter(k => k !== key)
  index.push(key)
  while (index.length > MAX_THREADS) {
    const old = index.shift()!
    try { window.localStorage.removeItem(old) } catch { /* ignore */ }
    mem.delete(old)
  }
  writeIndex(index)
}

function persist(key: string) {
  if (!isBrowser()) return
  const snap = mem.get(key)
  if (!snap) return
  const attempt = () => {
    window.localStorage.setItem(key, JSON.stringify(snap))
    touchIndex(key)
  }
  try {
    attempt()
  } catch {
    // Storage full: free the older half of the threads and try once more.
    try {
      const index = readIndex().filter(k => k !== key)
      for (const old of index.splice(0, Math.ceil(index.length / 2))) {
        window.localStorage.removeItem(old)
        mem.delete(old)
      }
      writeIndex(index)
      attempt()
    } catch { /* give up: the thread just won't be cached on disk */ }
  }
}

/** Memory first, then device storage. Call from an effect / layout effect, not during render. */
export function readThreadCache(userId: string, conversationId: string): ThreadSnapshot | null {
  const key = keyFor(userId, conversationId)
  const hit = mem.get(key)
  if (hit) return hit
  if (!isBrowser()) return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ThreadSnapshot
    if (!parsed || !Array.isArray(parsed.messages)) return null
    mem.set(key, parsed)
    return parsed
  } catch {
    return null
  }
}

/** Remember the thread. Memory is updated now; the device copy is written shortly after (debounced). */
export function writeThreadCache(userId: string, conversationId: string, messages: MessageRow[], hasMore: boolean) {
  const key = keyFor(userId, conversationId)
  const rows = messages.slice(-MAX_ROWS).map(strip)
  mem.set(key, { messages: rows, hasMore: hasMore || messages.length > MAX_ROWS, savedAt: Date.now() })
  if (!isBrowser()) return
  const pending = timers.get(key)
  if (pending) clearTimeout(pending)
  timers.set(key, setTimeout(() => { timers.delete(key); persist(key) }, PERSIST_DELAY_MS))
}

/** Sign-out / account switch: forget every thread and every decrypted text. */
export function clearChatThreadCache() {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  mem.clear()
  plainTextCache.clear()
  if (!isBrowser()) return
  try {
    const ls = window.localStorage
    for (const k of readIndex()) ls.removeItem(k)
    ls.removeItem(INDEX_KEY)
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i)
      if (k && k.startsWith(PREFIX)) ls.removeItem(k)
    }
  } catch { /* ignore */ }
}

/** Make the cache belong to `userId`: anything stored for someone else on this phone is dropped. */
export function claimChatThreadCache(userId: string) {
  if (!isBrowser()) return
  try {
    const own = `${PREFIX}${userId}:`
    const ls = window.localStorage
    let foreign = false
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i)
      if (k && k.startsWith(PREFIX) && !k.startsWith(own)) { ls.removeItem(k); foreign = true }
    }
    if (foreign) {
      mem.clear()
      plainTextCache.clear()
      writeIndex(readIndex().filter(k => k.startsWith(own)))
    }
  } catch { /* ignore */ }
}