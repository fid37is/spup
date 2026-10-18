// src/lib/chat-typing.ts
//
// "typing…" indicators, over Supabase Realtime BROADCAST (ephemeral: nothing is written to the
// database, nothing is stored).
//
// Every user has one inbox channel, `typing:<their user id>`. When I type, I broadcast to the
// OTHER person's inbox: { conversationId, from: me, typing }. That one inbox is all the receiver
// needs to listen to - the open chat uses it, and so does the chat list, so a person typing shows
// both inside the thread and next to their row in the list, without a channel per conversation.
//
// The hub below is a module-level singleton: the list and the thread share the same inbox channel
// (no subscribe/unsubscribe churn while navigating between them). It is closed shortly after the
// last listener goes away, and fully reset on sign-out (ChatCacheGuard).
//
// Needs "Allow public access" on in Supabase -> Realtime settings (the default). If it is off the
// indicator silently never shows; nothing else in chat is affected.

import { createBrowserClient } from '@/lib/supabase/client'

type Channel = ReturnType<ReturnType<typeof createBrowserClient>['channel']>

export interface TypingEvent { conversationId: string; from: string; typing: boolean }

const EVENT = 'typing'
/** A "typing" with no refresh for this long is treated as stopped (sender refreshes every REFRESH_MS). */
export const TYPING_TTL_MS = 6000
const REFRESH_MS = 2500
const IDLE_MS = 3000
const CLOSE_GRACE_MS = 5000
const MAX_SENDERS = 20

const client = () => createBrowserClient()

let inboxUser: string | null = null
let inbox: Channel | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<(e: TypingEvent) => void>()
const senders = new Map<string, Channel>()

function closeInbox() {
  if (inbox) void client().removeChannel(inbox)
  inbox = null
  inboxUser = null
}

function openInbox(userId: string) {
  if (inbox && inboxUser === userId) return
  closeInbox()
  inboxUser = userId
  inbox = client()
    .channel(`typing:${userId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: EVENT }, ({ payload }: { payload?: Partial<TypingEvent> }) => {
      if (!payload || typeof payload.from !== 'string' || typeof payload.conversationId !== 'string') return
      const e: TypingEvent = { conversationId: payload.conversationId, from: payload.from, typing: !!payload.typing }
      listeners.forEach(l => l(e))
    })
    .subscribe()
}

/** Listen for people typing to `userId` (me). Returns the unsubscribe function. */
export function onTyping(userId: string, cb: (e: TypingEvent) => void): () => void {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
  openInbox(userId)
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0 && !closeTimer) closeTimer = setTimeout(() => { closeTimer = null; closeInbox() }, CLOSE_GRACE_MS)
  }
}

function senderFor(peerId: string): Channel {
  let ch = senders.get(peerId)
  if (!ch) {
    if (senders.size >= MAX_SENDERS) {
      const oldest = senders.keys().next().value as string | undefined
      if (oldest) { const old = senders.get(oldest); senders.delete(oldest); if (old) void client().removeChannel(old) }
    }
    ch = client().channel(`typing:${peerId}`, { config: { broadcast: { self: false } } })
    ch.subscribe()
    senders.set(peerId, ch)
  }
  return ch
}

function sendTyping(userId: string, peerId: string, conversationId: string, typing: boolean) {
  try {
    const payload: TypingEvent = { conversationId, from: userId, typing }
    void senderFor(peerId).send({ type: 'broadcast', event: EVENT, payload }).catch(() => { /* ephemeral: never matters */ })
  } catch { /* ignore */ }
}

/**
 * Call input() on every keystroke and stop() when the message is sent, cleared or the screen is left.
 * Sends "typing" at most every 2.5s while keys are pressed, and "stopped" after 3s of silence.
 */
export function createTypingEmitter(userId: string, peerId: string, conversationId: string) {
  let active = false
  let lastSent = 0
  let idle: ReturnType<typeof setTimeout> | null = null

  const stop = () => {
    if (idle) { clearTimeout(idle); idle = null }
    if (active) { active = false; sendTyping(userId, peerId, conversationId, false) }
  }
  const input = () => {
    const now = Date.now()
    if (!active || now - lastSent > REFRESH_MS) {
      active = true
      lastSent = now
      sendTyping(userId, peerId, conversationId, true)
    }
    if (idle) clearTimeout(idle)
    idle = setTimeout(stop, IDLE_MS)
  }
  return { input, stop }
}

/**
 * Turns the event stream into "which conversations have someone typing right now", with the
 * time-out that covers a sender who vanished (closed the app) without sending "stopped".
 */
export function createTypingTracker(onChange: (typingConversationIds: Set<string>) => void) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const emit = () => onChange(new Set(timers.keys()))

  const clear = (conversationId: string) => {
    const t = timers.get(conversationId)
    if (t === undefined) return
    clearTimeout(t)
    timers.delete(conversationId)
    emit()
  }
  const apply = (e: TypingEvent) => {
    if (!e.typing) { clear(e.conversationId); return }
    const existing = timers.get(e.conversationId)
    if (existing) clearTimeout(existing)
    const isNew = existing === undefined
    timers.set(e.conversationId, setTimeout(() => clear(e.conversationId), TYPING_TTL_MS))
    if (isNew) emit()
  }
  const dispose = () => { for (const t of timers.values()) clearTimeout(t); timers.clear() }
  return { apply, clear, dispose }
}

/** Sign-out: drop every channel and listener. */
export function resetTypingHub() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
  listeners.clear()
  closeInbox()
  for (const ch of senders.values()) void client().removeChannel(ch)
  senders.clear()
}