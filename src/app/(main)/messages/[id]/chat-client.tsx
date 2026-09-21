'use client'

// src/app/(main)/messages/[id]/chat-client.tsx
//
// The conversation screen. See docs/CHAT_FIXES.md for the reasoning behind the
// structure; the short version:
//   - `messages` holds the rows. Decrypted text lives in a separate `texts` map
//     keyed by message id, so decrypting can never overwrite or drop a message.
//   - Live rows come straight from the realtime payload (no second fetch that
//     could fail silently), and everything is re-synced on mount, on reconnect,
//     when the tab becomes visible again, and by a low-rate poll as a safety net.
//   - Sending is optimistic with a per-message status (sending / failed / sent /
//     delivered / read). Sends are queued so order is preserved, and wait for the
//     encryption key to settle so nothing is sent in plaintext by accident.

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Send, X, Trash2, CornerUpLeft, Lock, ChevronDown, Loader2, RefreshCw } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'
import {
  sendMessageAction, deleteMessageAction, loadMessagesAction, markConversationReadAction,
  uploadPublicKeyAction, getPublicKeyAction, verifyChatPinAction, getWrappedKeyAction, uploadWrappedKeyAction,
} from '@/lib/actions/messages'
import {
  recoverOrCreateKeyPair, deriveSharedKey, encryptMessage, decryptMessage, isEncrypted,
  UNDECRYPTABLE, WrongPasswordError,
} from '@/lib/chat-crypto'
import { getSessionPinMaterial, setSessionPinMaterial } from '@/lib/chat-pin-session'
import {
  arrange, upsertIncoming, confirmOptimistic, markFailed, markSending, removeMessage,
  applyRowUpdate, mergeFetched, statusOf, findPendingMatch, dayKey, dayLabel, type ChatMsg,
} from '@/lib/chat-message-state'
import type { MessageRow, ReplyRef } from '@/lib/chat-queries'
import MessageStatusIcon from '@/components/chat/message-status'
import { useToast } from '@/components/layout/toast'
import { notifyChatUnreadChanged } from '@/hooks/use-chat-unread'

const AVATAR_COLORS = ['#1A9E5F', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A6A1A']
const MAX_TEXT = 4000            // characters per message (the server allows more for ciphertext overhead)
const POLL_MS = 15_000           // safety-net re-sync while the tab is visible (see docs/CHAT_FIXES.md)
const NEAR_BOTTOM_PX = 120

interface Message extends ChatMsg {
  reply_to?: ReplyRef | null
  /** Stable React key: an optimistic bubble keeps it when it gets its real id. */
  _key?: string
}

interface OtherUser {
  id: string; username: string; display_name: string
  avatar_url: string | null; verification_tier: string
}

interface ChatClientProps {
  conversationId: string
  initialMessages: MessageRow[]
  initialHasMore: boolean
  initialError: string | null
  currentUserId: string
  otherUser: OtherUser
}

type CryptoState = 'loading' | 'ready' | 'no-peer-key' | 'unavailable'
type RealtimeState = 'connecting' | 'live' | 'down'

const isTouchPrimary = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

export default function ChatClient({
  conversationId, initialMessages, initialHasMore, initialError, currentUserId, otherUser,
}: ChatClientProps) {
  const { error: toastError, success: toastSuccess } = useToast()

  // ── State ──────────────────────────────────────────────────────────────────
  const [messages,     setMessages]     = useState<Message[]>(() => arrange(initialMessages as Message[]))
  const [texts,        setTexts]        = useState<Record<string, string>>({})   // message id -> plaintext
  const [body,         setBody]         = useState('')
  const [replyTo,      setReplyTo]      = useState<Message | null>(null)
  const [selectedId,   setSelectedId]   = useState<string | null>(null)          // message whose action bar is open
  const [hasMore,      setHasMore]      = useState(initialHasMore)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loaded,       setLoaded]       = useState(false)                        // first client sync finished
  const [loadError,    setLoadError]    = useState<string | null>(initialError)
  const [cryptoState,  setCryptoState]  = useState<CryptoState>('loading')
  const [realtime,     setRealtime]     = useState<RealtimeState>('connecting')
  const [online,       setOnline]       = useState(true)
  const [unseen,       setUnseen]       = useState(0)
  const [showJump,     setShowJump]     = useState(false)

  // Fallback PIN prompt for recoverOrCreateKeyPair(): only shown when
  // getSessionPinMaterial() is empty (e.g. this tab reloaded after PinGate
  // already unlocked it - sessionStorage still says "unlocked" so PinGate
  // won't re-ask, but the in-memory PIN+pepper was cleared on reload).
  const [pinPromptOpen,  setPinPromptOpen]  = useState(false)
  const [pinDigits,      setPinDigits]      = useState('')
  const [pinPromptError, setPinPromptError] = useState('')
  const [pinBusy,        setPinBusy]        = useState(false)
  const pinResolverRef = useRef<((password: string | null) => void) | null>(null)

  // ── Refs ───────────────────────────────────────────────────────────────────
  const listRef      = useRef<HTMLDivElement>(null)
  const contentRef   = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLTextAreaElement>(null)
  const sbRef        = useRef<ReturnType<typeof createBrowserClient> | null>(null)
  const messagesRef  = useRef<Message[]>(messages)
  const stickRef     = useRef(true)                       // is the view pinned to the latest message?
  const prevLenRef   = useRef(0)
  const restoreRef   = useRef<{ h: number; top: number } | null>(null)   // keep scroll position when older pages are prepended
  const syncingRef   = useRef(false)
  const ackTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendChainRef = useRef<Promise<void>>(Promise.resolve())
  const outboxRef    = useRef(new Map<string, { text: string; replyId: string | null; wire: string | null }>())

  // Encryption
  const privateKeyRef = useRef<CryptoKey | null>(null)
  const sharedKeyRef  = useRef<CryptoKey | null>(null)
  const peerPubRef    = useRef<string | null>(null)
  const peerCheckRef  = useRef(0)
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null)
  // Resolves once we know whether we can encrypt (ready / peer has no key / unavailable).
  const settledRef = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null)
  if (!settledRef.current) {
    let resolve!: () => void
    const promise = new Promise<void>(r => { resolve = r })
    settledRef.current = { promise, resolve }
  }

  messagesRef.current = messages
  const getSb = () => (sbRef.current ??= createBrowserClient())

  const otherInitials = otherUser.display_name?.slice(0, 2).toUpperCase() ?? '??'
  const otherColor    = AVATAR_COLORS[(otherUser.username?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
  const canSend       = !!otherUser.id

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Plaintext to show for a message (or reply target). undefined = still decrypting / no key. */
  function textOf(m: { id: string; body: string | null }): string | null | undefined {
    if (!m.body) return null
    if (texts[m.id] !== undefined) return texts[m.id]
    if (isEncrypted(m.body)) return undefined
    return m.body
  }

  function placeholder(): string {
    return cryptoState === 'loading' ? '…' : '🔒 Encrypted message'
  }

  const nameOf = (senderId: string) => (senderId === currentUserId ? 'You' : otherUser.display_name)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const noteIncoming = useCallback((n: number) => {
    if (!stickRef.current) setUnseen(u => u + n)
  }, [])

  // ── Crypto ─────────────────────────────────────────────────────────────────

  // Supplies recoverOrCreateKeyPair() with `${pin}:${pepper}`. The common
  // case (PinGate unlocked this same page load) resolves instantly from the
  // in-memory session material with no UI. Only when that's empty do we
  // show a prompt - and only submitPinPrompt() resolves it, and only after
  // verifyChatPinAction confirms the PIN against the server-side bcrypt
  // hash, so a wrong PIN never gets passed through to the unwrap step.
  const getPassword = useCallback((): Promise<string | null> => {
    const cached = getSessionPinMaterial()
    if (cached) return Promise.resolve(`${cached.pin}:${cached.pepper}`)
    setPinPromptError('')
    setPinDigits('')
    setPinPromptOpen(true)
    return new Promise<string | null>(resolve => { pinResolverRef.current = resolve })
  }, [])

  async function submitPinPrompt() {
    if (pinDigits.length !== 4 || pinBusy) return
    setPinBusy(true)
    const result = await verifyChatPinAction(pinDigits)
    setPinBusy(false)
    if (!result.valid || !result.pepper) {
      setPinPromptError(
        'rateLimited' in result && result.rateLimited ? 'Too many attempts. Please wait a few minutes and try again.'
        : 'noPin' in result && result.noPin ? 'No chat PIN is set for this account yet.'
        : 'Incorrect PIN. Try again.'
      )
      setPinDigits('')
      return
    }
    setSessionPinMaterial(pinDigits, result.pepper)
    setPinPromptOpen(false)
    pinResolverRef.current?.(`${pinDigits}:${result.pepper}`)
    pinResolverRef.current = null
  }

  function cancelPinPrompt() {
    setPinPromptOpen(false)
    pinResolverRef.current?.(null) // recoverOrCreateKeyPair treats this as "cancelled" and leaves messages unencrypted
    pinResolverRef.current = null
  }

  /** Fetch the other person's public key and derive the shared key. false = they have none yet. */
  const connectPeer = useCallback(async (): Promise<boolean> => {
    const priv = privateKeyRef.current
    if (!priv || !otherUser.id) return false
    const { publicKey } = await getPublicKeyAction(otherUser.id)
    if (!publicKey) return false
    if (publicKey === peerPubRef.current && sharedKeyRef.current) return true
    const shared = await deriveSharedKey(priv, publicKey)
    const changed = peerPubRef.current !== null && peerPubRef.current !== publicKey
    peerPubRef.current = publicKey
    sharedKeyRef.current = shared
    setSharedKey(shared)
    setCryptoState('ready')
    // They re-keyed (new device): anything we failed to open may open now.
    if (changed) setTexts(t => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== UNDECRYPTABLE)))
    return true
  }, [otherUser.id])

  /** Throttled re-check: the other person may have opened Chat since we did (or re-keyed). */
  const recheckPeerKey = useCallback(async () => {
    if (!privateKeyRef.current) return
    if (Date.now() - peerCheckRef.current < 10_000) return
    peerCheckRef.current = Date.now()
    try { await connectPeer() } catch { /* try again next time */ }
  }, [connectPeer])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { publicKeyB64, privateKey } = await recoverOrCreateKeyPair({
          userId: currentUserId,
          fetchPublicKey: async () => (await getPublicKeyAction(currentUserId)).publicKey,
          fetchWrapped: async () => (await getWrappedKeyAction()).wrapped ?? null,
          uploadWrapped: async (wrapped, salt, iv) => { await uploadWrappedKeyAction(wrapped, salt, iv) },
          getPassword,
        })
        if (cancelled) return
        privateKeyRef.current = privateKey
        await uploadPublicKeyAction(publicKeyB64)
        const ok = await connectPeer()
        if (!cancelled && !ok) setCryptoState('no-peer-key')
      } catch (e) {
        if (cancelled) return
        if (e instanceof WrongPasswordError) {
          // Only possible if the stored pepper doesn't match the wrapped
          // key at all (data inconsistency) - a wrong PIN is already
          // rejected inside submitPinPrompt before it ever gets here.
          console.warn('Chat key recovery: PIN did not unlock the saved key', e)
        } else {
          console.warn('Crypto init failed - messages will be unencrypted', e)
        }
        setCryptoState('unavailable')
      } finally {
        // Only the run that is still current may settle/close, otherwise React
        // StrictMode's first (cancelled) run would release queued sends early
        // and close a PIN prompt the second run is waiting on.
        if (!cancelled) {
          setPinPromptOpen(false)
          pinResolverRef.current = null
          settledRef.current?.resolve()
        }
      }
    })()
    return () => { cancelled = true }
  }, [currentUserId, getPassword, connectPeer])

  // Decrypt whatever needs it. Writes ONLY to `texts`, never to `messages`.
  useEffect(() => {
    if (!sharedKey) return
    const todo: { id: string; body: string }[] = []
    for (const m of messages) {
      if (m.body && !m.is_deleted && isEncrypted(m.body) && texts[m.id] === undefined) todo.push({ id: m.id, body: m.body })
      const r = m.reply_to
      if (r?.body && !r.is_deleted && isEncrypted(r.body) && texts[r.id] === undefined && !todo.some(x => x.id === r.id)) {
        todo.push({ id: r.id, body: r.body })
      }
    }
    if (todo.length === 0) return
    let cancelled = false
    ;(async () => {
      const done = await Promise.all(todo.map(async x => [x.id, await decryptMessage(x.body, sharedKey)] as const))
      if (cancelled) return
      setTexts(prev => {
        const next = { ...prev }
        for (const [id, text] of done) if (next[id] === undefined) next[id] = text
        return next
      })
      if (done.some(([, t]) => t === UNDECRYPTABLE)) void recheckPeerKey()
    })()
    return () => { cancelled = true }
  }, [messages, sharedKey, texts, recheckPeerKey])

  // ── Read / delivered acknowledgement ───────────────────────────────────────
  // "Read" is only sent while the messages are really on screen. (It used to be
  // written as a side effect of the server rendering the page - i.e. before the
  // PIN gate was even passed.)
  const ack = useCallback(async (force = false) => {
    const visible = document.visibilityState === 'visible'
    const unread = messagesRef.current.some(m => m.sender_id !== currentUserId && !m._optimistic && !m.read_at)
    if (visible && !unread && !force) return
    if (!visible && !unread) return
    const res = await markConversationReadAction(conversationId, visible ? 'read' : 'delivered')
    if (visible && res && 'success' in res && res.success) {
      const now = new Date().toISOString()
      setMessages(prev => prev.map(m =>
        m.sender_id !== currentUserId && !m._optimistic && !m.read_at ? { ...m, read_at: now } : m))
      notifyChatUnreadChanged()           // the Chat tab badge re-checks
    }
  }, [conversationId, currentUserId])

  const scheduleAck = useCallback((force = false) => {
    if (ackTimerRef.current) clearTimeout(ackTimerRef.current)
    ackTimerRef.current = setTimeout(() => { void ack(force) }, 350)
  }, [ack])

  // ── Loading / syncing ──────────────────────────────────────────────────────

  const syncLatest = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (syncingRef.current) return
    syncingRef.current = true
    try {
      const res = await loadMessagesAction(conversationId)
      if (res.error) {
        console.error('[chat] could not load messages:', res.error)
        if (!opts.silent || messagesRef.current.length === 0) setLoadError(res.error)
        return
      }
      setLoadError(null)
      const known = new Set(messagesRef.current.map(m => m.id))
      const fresh = res.messages.filter(m => !known.has(m.id) && m.sender_id !== currentUserId)
      if (messagesRef.current.every(m => m._optimistic)) setHasMore(res.hasMore)
      setMessages(prev => mergeFetched(prev, res.messages as Message[]))
      if (fresh.length > 0) noteIncoming(fresh.length)
      if (res.messages.some(m => m.sender_id !== currentUserId && !m.read_at)) scheduleAck()
      if (!sharedKeyRef.current) void recheckPeerKey()
    } catch (e) {
      console.error('[chat] sync threw:', e)
      if (!opts.silent || messagesRef.current.length === 0) setLoadError('Could not reach the server')
    } finally {
      syncingRef.current = false
      setLoaded(true)
    }
  }, [conversationId, currentUserId, noteIncoming, scheduleAck, recheckPeerKey])

  // A live INSERT straight from the realtime payload (no second fetch).
  const handleIncomingRow = useCallback((row: MessageRow) => {
    const list = messagesRef.current
    const match = findPendingMatch(list, row as ChatMsg)
    const existing = list.find(m => m.id === row.id)
    if (match) {
      // The echo of my own send: carry the plaintext over so the text doesn't flicker.
      setTexts(t => (t[match.id] !== undefined && t[row.id] === undefined ? { ...t, [row.id]: t[match.id] } : t))
    }
    let reply: ReplyRef | null = row.reply_to ?? existing?.reply_to ?? null
    if (!reply && row.reply_to_id) {
      const t = list.find(m => m.id === row.reply_to_id)
      if (t) reply = { id: t.id, body: t.body, sender_id: t.sender_id, is_deleted: t.is_deleted }
    }
    setMessages(prev => upsertIncoming(prev, { ...(row as Message), reply_to: reply, _key: match?._key ?? existing?._key }))

    if (row.reply_to_id && !reply) void syncLatest({ silent: true })   // quoted message isn't loaded: pull it in
    if (!existing && !match && row.sender_id !== currentUserId) {
      noteIncoming(1)
      scheduleAck()
      if (!sharedKeyRef.current && isEncrypted(row.body)) void recheckPeerKey()
    }
  }, [currentUserId, noteIncoming, scheduleAck, syncLatest, recheckPeerKey])

  // Effects below call through this ref so they never need to re-subscribe when a callback changes.
  const latest = useRef({ syncLatest, handleIncomingRow, scheduleAck })
  latest.current = { syncLatest, handleIncomingRow, scheduleAck }

  // First client sync + mark read. Runs even when the server render already gave
  // us messages: that HTML can be stale (service-worker cache, slow network).
  useEffect(() => {
    void latest.current.syncLatest()
    latest.current.scheduleAck(true)
  }, [conversationId])

  // Realtime
  useEffect(() => {
    const sb = getSb()
    // Unique topic per subscription: re-using one topic while the previous
    // channel is still closing makes supabase-js hand back the closing channel,
    // and adding listeners to it throws.
    const topic = `chat:${conversationId}:${Math.random().toString(36).slice(2, 8)}`
    const filter = `conversation_id=eq.${conversationId}`
    const channel = sb
      .channel(topic)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (payload: any) => {
        latest.current.handleIncomingRow(payload.new as MessageRow)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, (payload: any) => {
        setMessages(prev => applyRowUpdate(prev, payload.new))
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          setRealtime('live')
          void latest.current.syncLatest({ silent: true })      // close any gap from before/while (re)connecting
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtime('down')
        }
      })
    return () => { void sb.removeChannel(channel) }
  }, [conversationId])

  // Safety net + wake-ups: works even if realtime isn't delivering (publication
  // not enabled, RLS, flaky mobile network) and after the phone slept.
  useEffect(() => {
    setOnline(navigator.onLine)
    const wake = () => {
      if (document.visibilityState !== 'visible') return
      void latest.current.syncLatest({ silent: true })
      latest.current.scheduleAck()
    }
    const onOnline  = () => { setOnline(true); wake() }
    const onOffline = () => setOnline(false)
    const poll = setInterval(() => { if (navigator.onLine) wake() }, POLL_MS)
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      clearInterval(poll)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      if (ackTimerRef.current) clearTimeout(ackTimerRef.current)
    }
  }, [])

  // ── Scrolling ──────────────────────────────────────────────────────────────

  function onListScroll() {
    const el = listRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    stickRef.current = near
    setShowJump(!near)
    if (near) setUnseen(0)
  }

  // New message at the bottom: follow it if we were at the bottom or I sent it;
  // older page prepended: keep the reading position.
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    if (restoreRef.current) {
      const { h, top } = restoreRef.current
      el.scrollTop = el.scrollHeight - h + top
      restoreRef.current = null
      prevLenRef.current = messages.length
      return
    }
    const last = messages[messages.length - 1]
    if (messages.length > prevLenRef.current && last) {
      if (stickRef.current || last.sender_id === currentUserId) {
        stickRef.current = true
        scrollToBottom(prevLenRef.current === 0 ? 'auto' : 'smooth')
      }
    }
    prevLenRef.current = messages.length
  }, [messages, currentUserId, scrollToBottom])

  // Content grew without a new message (a message finished decrypting, the
  // keyboard changed the height, a reply quote appeared): stay pinned to the bottom.
  useEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const el = listRef.current
      if (el && stickRef.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [])

  async function loadOlder() {
    if (loadingOlder) return
    const oldest = messagesRef.current.find(m => !m._optimistic)
    if (!oldest) return
    setLoadingOlder(true)
    try {
      const res = await loadMessagesAction(conversationId, oldest.created_at)
      if (res.error) { toastError("Couldn't load earlier messages. Try again."); return }
      const el = listRef.current
      if (el && res.messages.length > 0) restoreRef.current = { h: el.scrollHeight, top: el.scrollTop }
      setMessages(prev => mergeFetched(prev, res.messages as Message[]))
      setHasMore(res.hasMore)
    } catch {
      toastError("Couldn't load earlier messages. Try again.")
    } finally {
      setLoadingOlder(false)
    }
  }

  function jumpToMessage(id: string) {
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(id)}"]`)
    if (!list || !el) return
    const delta = el.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 3
    list.scrollTo({ top: list.scrollTop + delta, behavior: 'smooth' })
    el.animate([{ background: 'var(--color-brand-muted)' }, { background: 'transparent' }], { duration: 1200 })
  }

  // ── Sending ────────────────────────────────────────────────────────────────

  const deliver = useCallback(async (tempId: string) => {
    const item = outboxRef.current.get(tempId)
    if (!item) return
    try {
      await settledRef.current!.promise                       // never send before we know if we can encrypt
      if (!outboxRef.current.has(tempId)) return              // discarded while waiting
      if (item.wire === null) {
        if (!sharedKeyRef.current && privateKeyRef.current) await connectPeer().catch(() => false)
        item.wire = sharedKeyRef.current ? await encryptMessage(item.text, sharedKeyRef.current) : item.text
        const wire = item.wire
        // The wire body is what the realtime echo is matched against.
        setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, body: wire } : m)))
      }
      const res = await sendMessageAction(conversationId, item.wire, item.replyId ?? undefined)
      if (!('success' in res) || !res.success) throw new Error(('error' in res && res.error) || 'Send failed')
      outboxRef.current.delete(tempId)
      setTexts(t => ({ ...t, [res.messageId]: item.text }))
      setMessages(prev => confirmOptimistic(prev, tempId, { id: res.messageId, created_at: res.createdAt }))
    } catch (e) {
      if (!outboxRef.current.has(tempId)) return
      console.warn('[chat] send failed:', e)
      setMessages(prev => markFailed(prev, tempId))
    }
  }, [conversationId, connectPeer])

  const enqueue = useCallback((tempId: string) => {
    sendChainRef.current = sendChainRef.current.then(() => deliver(tempId)).catch(() => {})
  }, [deliver])

  function handleSend() {
    const text = body.trim()
    if (!text || !canSend) return
    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const reply = replyTo
    const optimistic: Message = {
      id: tempId, _key: tempId,
      body: null,                                   // filled with the wire body just before sending
      sender_id: currentUserId,
      created_at: new Date().toISOString(),
      is_deleted: false, read_at: null, delivered_at: null,
      reply_to_id: reply?.id ?? null,
      reply_to: reply ? { id: reply.id, body: reply.body, sender_id: reply.sender_id, is_deleted: reply.is_deleted } : null,
      _optimistic: true,
    }
    outboxRef.current.set(tempId, { text, replyId: reply?.id ?? null, wire: null })
    setTexts(t => ({ ...t, [tempId]: text }))
    stickRef.current = true
    setMessages(prev => arrange([...prev, optimistic]))
    setBody('')
    setReplyTo(null)
    if (inputRef.current) inputRef.current.style.height = 'auto'
    enqueue(tempId)
  }

  function retrySend(id: string) {
    if (!outboxRef.current.has(id)) return
    setMessages(prev => markSending(prev, id))
    enqueue(id)
  }

  function discardFailed(id: string) {
    outboxRef.current.delete(id)
    setMessages(prev => removeMessage(prev, id))
    setTexts(t => { const { [id]: _drop, ...rest } = t; return rest })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // On phones Enter is a new line (there is a Send button); on desktop Enter sends.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouchPrimary()) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleDelete(id: string) {
    const snapshot = messagesRef.current.find(m => m.id === id)
    if (!snapshot) return
    setSelectedId(null)
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, is_deleted: true, body: null } : m)))
    const res = await deleteMessageAction(id).catch(() => ({ error: 'network' }))
    if (res && 'error' in res && res.error) {
      setMessages(prev => prev.map(m => (m.id === id ? snapshot : m)))
      toastError("Couldn't delete that message. Try again.")
    }
  }

  async function handleCopy(m: Message) {
    const t = textOf(m)
    if (!t) return
    try { await navigator.clipboard.writeText(t); toastSuccess('Copied') } catch { toastError("Couldn't copy") }
    setSelectedId(null)
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const rows: ({ type: 'day'; key: string; label: string } | { type: 'msg'; key: string; msg: Message; grouped: boolean })[] = []
  {
    let prev: Message | undefined
    for (const msg of messages) {
      const k = dayKey(msg.created_at)
      if (!prev || dayKey(prev.created_at) !== k) rows.push({ type: 'day', key: `day-${k}`, label: dayLabel(msg.created_at) })
      const grouped = !!prev && dayKey(prev.created_at) === k && prev.sender_id === msg.sender_id &&
        Math.abs(new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 60_000
      rows.push({ type: 'msg', key: msg._key ?? msg.id, msg, grouped })
      prev = msg
    }
  }

  // Only ever states something that is true and useful. Encryption problems
  // (no key yet, unavailable) are handled silently: nothing is shown for them.
  const subtitle = !online
    ? { text: 'Waiting for network…', lock: false }
    : realtime === 'down' && loaded
      ? { text: 'Reconnecting…', lock: false }
      : cryptoState === 'ready'
        ? { text: 'End-to-end encrypted', lock: true }
        : { text: '', lock: false }

  const pillBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border)', borderRadius: 14, padding: '5px 10px', cursor: 'pointer',
    fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: "'DM Sans', sans-serif",
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%', width: '100%' }}>

      {/* Header */}
      <div style={{
        position: 'relative', zIndex: 10, flexShrink: 0,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: '12px 16px', paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Link href="/messages" aria-label="Back to chats" style={{ color: 'var(--color-text-primary)', display: 'flex', flexShrink: 0, padding: 4, margin: -4 }}>
          <ArrowLeft size={20} />
        </Link>
        <Link href={otherUser.id ? `/user/${otherUser.username}` : '#'} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flex: 1, minWidth: 0 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
            background: otherUser.avatar_url ? 'transparent' : otherColor,
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 13, color: 'white',
          }}>
            {otherUser.avatar_url
              ? <img src={otherUser.avatar_url} alt={otherUser.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : otherInitials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {otherUser.display_name}
            </div>
            {subtitle.text && (
              <div data-testid="chat-subtitle" style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {subtitle.lock && <Lock size={9} />}
                {subtitle.text}
              </div>
            )}
          </div>
        </Link>
      </div>

      {/* Messages */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          ref={listRef}
          data-chat-messages
          role="log"
          aria-live="polite"
          onScroll={onListScroll}
          onClick={() => setSelectedId(null)}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '12px 16px' }}
        >
          <div ref={contentRef}>

            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
                <button onClick={e => { e.stopPropagation(); void loadOlder() }} disabled={loadingOlder} style={pillBtn}>
                  {loadingOlder ? <Loader2 size={13} style={{ animation: 'chat-spin 0.8s linear infinite' }} /> : null}
                  {loadingOlder ? 'Loading…' : 'Load earlier messages'}
                </button>
              </div>
            )}

            {/* Couldn't load, and nothing to show: say so, with a way out. */}
            {loadError && messages.length === 0 && (
              <div data-testid="chat-load-error" style={{ textAlign: 'center', padding: '56px 24px' }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)', marginBottom: 6 }}>
                  Couldn&apos;t load your messages
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                  Check your connection and try again. Your messages are safe.
                </div>
                <button onClick={() => { setLoadError(null); setLoaded(false); void syncLatest() }} className="para-btn-primary"
                  style={{ padding: '10px 22px', fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <RefreshCw size={14} /> Try again
                </button>
              </div>
            )}

            {/* Couldn't refresh, but there is history on screen */}
            {loadError && messages.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 8px' }}>
                <button onClick={e => { e.stopPropagation(); void syncLatest() }} style={{ ...pillBtn, color: 'var(--color-error)' }}>
                  <RefreshCw size={12} /> Couldn&apos;t refresh · Tap to retry
                </button>
              </div>
            )}

            {!loadError && messages.length === 0 && !loaded && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '56px 0' }}>
                <Loader2 size={22} color="var(--color-brand)" style={{ animation: 'chat-spin 0.8s linear infinite' }} />
              </div>
            )}

            {!loadError && messages.length === 0 && loaded && (
              <div data-testid="chat-empty" style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--color-text-secondary)', fontSize: 14 }}>
                No messages yet. Say hi 👋
              </div>
            )}

            {rows.map(row => {
              if (row.type === 'day') {
                return (
                  <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 12px' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{row.label}</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                  </div>
                )
              }

              const { msg, grouped } = row
              const isMine = msg.sender_id === currentUserId
              const status = isMine && !msg.is_deleted ? statusOf(msg) : null
              const text = msg.is_deleted ? null : textOf(msg)
              const failedDecrypt = text === UNDECRYPTABLE
              const selected = selectedId === msg.id
              const canAct = !msg.is_deleted && !msg._optimistic

              const replyText = msg.reply_to
                ? (msg.reply_to.is_deleted || msg.reply_to.body === null ? 'Message deleted' : (textOf(msg.reply_to) ?? placeholder()))
                : null

              return (
                <div
                  key={row.key}
                  data-msg-id={msg.id}
                  style={{
                    display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row',
                    alignItems: 'flex-end', gap: 8, marginBottom: grouped ? 2 : 10, borderRadius: 12,
                  }}
                >
                  {/* Avatar */}
                  {!isMine && (
                    <div style={{ width: 28, flexShrink: 0 }}>
                      {!grouped && (
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: otherUser.avatar_url ? 'transparent' : otherColor,
                          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 800, color: 'white', fontFamily: "'Syne', sans-serif",
                        }}>
                          {otherUser.avatar_url
                            ? <img src={otherUser.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : otherInitials}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ maxWidth: '78%', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                    {/* Bubble (tap to open actions) */}
                    <div
                      role={canAct ? 'button' : undefined}
                      tabIndex={canAct ? 0 : undefined}
                      aria-label={canAct ? 'Message options' : undefined}
                      onClick={e => { e.stopPropagation(); if (canAct) setSelectedId(selected ? null : msg.id) }}
                      onKeyDown={e => { if (canAct && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelectedId(selected ? null : msg.id) } }}
                      style={{
                        background: isMine ? 'var(--color-brand)' : 'var(--color-surface-2)',
                        color: isMine ? 'white' : 'var(--color-text-primary)',
                        padding: '9px 13px',
                        borderRadius: isMine
                          ? (grouped ? '18px 4px 4px 18px' : '18px 4px 18px 18px')
                          : (grouped ? '4px 18px 18px 4px' : '4px 18px 18px 18px'),
                        fontSize: 14, lineHeight: 1.5,
                        fontFamily: "'DM Sans', sans-serif",
                        wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                        opacity: msg._optimistic && !msg._failed ? 0.72 : 1,
                        outline: msg._failed ? '1px solid var(--color-error)' : selected ? '2px solid var(--color-brand-hover)' : 'none',
                        outlineOffset: selected ? 1 : -1,
                        cursor: canAct ? 'pointer' : 'default',
                        transition: 'opacity 0.2s',
                      }}
                    >
                      {msg.reply_to && !msg.is_deleted && (
                        <div
                          onClick={e => { e.stopPropagation(); jumpToMessage(msg.reply_to!.id) }}
                          style={{
                            background: isMine ? 'rgba(255,255,255,0.14)' : 'var(--color-surface-3)',
                            borderLeft: `3px solid ${isMine ? 'rgba(255,255,255,0.7)' : 'var(--color-brand)'}`,
                            borderRadius: 8, padding: '5px 9px', margin: '0 0 6px', whiteSpace: 'normal',
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 1, color: isMine ? 'rgba(255,255,255,0.9)' : 'var(--color-brand)' }}>
                            {nameOf(msg.reply_to.sender_id)}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {replyText}
                          </div>
                        </div>
                      )}

                      {msg.is_deleted
                        ? <em style={{ opacity: 0.6, fontSize: 13 }}>🗑 Message deleted</em>
                        : failedDecrypt
                          ? <em style={{ opacity: 0.7, fontSize: 13 }}>🔒 Can&apos;t open this message on this device</em>
                          : text === undefined
                            ? <em style={{ opacity: 0.6, fontSize: 13 }}>{placeholder()}</em>
                            : text}
                    </div>

                    {/* Actions for the tapped message */}
                    {selected && canAct && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                        <button style={pillBtn} onClick={e => { e.stopPropagation(); setReplyTo(msg); setSelectedId(null); inputRef.current?.focus() }}>
                          <CornerUpLeft size={12} /> Reply
                        </button>
                        {!!textOf(msg) && !failedDecrypt && (
                          <button style={pillBtn} onClick={e => { e.stopPropagation(); void handleCopy(msg) }}>Copy</button>
                        )}
                        {isMine && (
                          <button style={{ ...pillBtn, color: 'var(--color-error)' }} onClick={e => { e.stopPropagation(); void handleDelete(msg.id) }}>
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </div>
                    )}

                    {/* Time + delivery status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                      {status === 'failed' ? (
                        <>
                          <span style={{ fontSize: 11, color: 'var(--color-error)' }}>Not sent</span>
                          <button onClick={() => retrySend(msg.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--color-brand)' }}>Retry</button>
                          <button onClick={() => discardFailed(msg.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--color-text-secondary)' }}>Discard</button>
                        </>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                          {new Date(msg.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {status && status !== 'failed' && <MessageStatusIcon status={status} />}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Jump to latest */}
        {showJump && (
          <button
            aria-label={unseen > 0 ? `Jump to latest, ${unseen} new` : 'Jump to latest'}
            onClick={() => { scrollToBottom('smooth'); setUnseen(0) }}
            style={{
              position: 'absolute', right: 14, bottom: 12, height: 38, minWidth: 38, padding: unseen > 0 ? '0 12px' : 0,
              borderRadius: 19, border: '1px solid var(--color-border)', background: 'var(--color-surface)',
              color: 'var(--color-text-primary)', boxShadow: '0 4px 14px rgba(0,0,0,0.35)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 700,
            }}
          >
            {unseen > 0 && <span style={{ color: 'var(--color-brand)' }}>{unseen > 99 ? '99+' : unseen}</span>}
            <ChevronDown size={18} />
          </button>
        )}
      </div>

      {/* Reply banner */}
      {replyTo && (
        <div style={{
          padding: '8px 16px', background: 'var(--color-surface-2)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0, borderLeft: '3px solid var(--color-brand)', paddingLeft: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--color-brand)', fontWeight: 600, marginBottom: 2 }}>
              Replying to {nameOf(replyTo.sender_id)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {textOf(replyTo) ?? placeholder()}
            </div>
          </div>
          <button aria-label="Cancel reply" onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Composer */}
      {canSend ? (
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--color-border)',
          background: 'var(--nav-bg)', backdropFilter: 'blur(20px)',
          display: 'flex', alignItems: 'flex-end', gap: 10,
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
          flexShrink: 0,
        }}>
          <textarea
            ref={inputRef}
            value={body}
            maxLength={MAX_TEXT}
            onChange={e => {
              setBody(e.target.value)
              const ta = e.target
              ta.style.height = 'auto'
              ta.style.height = ta.scrollHeight + 'px'
            }}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            aria-label="Message"
            enterKeyHint="send"
            rows={1}
            style={{
              flex: 1,
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 22,
              padding: '10px 16px',
              fontSize: 16,                       // 16px: iOS Safari zooms the page on focus below this
              color: 'var(--color-text-primary)',
              fontFamily: "'DM Sans', sans-serif",
              outline: 'none', resize: 'none',
              caretColor: 'var(--color-brand)',
              minHeight: 40, maxHeight: 120,
              lineHeight: 1.4,
            }}
          />
          <button
            aria-label="Send message"
            onMouseDown={e => e.preventDefault()}   // keep the keyboard open on the phone
            onClick={handleSend}
            disabled={!body.trim()}
            style={{
              width: 42, height: 42, borderRadius: '50%',
              background: body.trim() ? 'var(--color-brand)' : 'var(--color-surface-2)',
              border: 'none', cursor: body.trim() ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 0.2s',
            }}
          >
            <Send size={17} color={body.trim() ? 'white' : 'var(--color-text-muted)'} />
          </button>
        </div>
      ) : (
        <div style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
          This account no longer exists, so you can&apos;t send messages here.
        </div>
      )}

      {/* Fallback PIN prompt - only shown when recoverOrCreateKeyPair() needs
          PIN material getSessionPinMaterial() didn't have (see getPassword above) */}
      {pinPromptOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'var(--overlay-bg)' }} />
          <div style={{ position: 'fixed', inset: 0, zIndex: 501, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 20, padding: 24, width: '100%', maxWidth: 320,
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', background: 'var(--color-brand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Lock size={22} color="white" />
                </div>
              </div>
              <h3 style={{ margin: '0 0 6px', textAlign: 'center', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 17, color: 'var(--color-text-primary)' }}>
                Confirm your chat PIN
              </h3>
              <p style={{ margin: '0 0 18px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                Needed to unlock your message history on this device
              </p>
              <input
                value={pinDigits}
                onChange={e => { setPinDigits(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinPromptError('') }}
                onKeyDown={e => { if (e.key === 'Enter') void submitPinPrompt() }}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                autoFocus
                placeholder="••••"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--input-bg)', border: '1px solid var(--color-border)', borderRadius: 10,
                  padding: '12px 14px', color: 'var(--color-text-primary)',
                  fontSize: 20, letterSpacing: '0.6em', textAlign: 'center', outline: 'none',
                  fontFamily: "'DM Sans', sans-serif", marginBottom: 12,
                }}
              />
              {pinPromptError && (
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)', textAlign: 'center' }}>
                  {pinPromptError}
                </p>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={cancelPinPrompt}
                  disabled={pinBusy}
                  className="para-btn-ghost"
                  style={{ flex: 1, padding: '12px 0', fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 600 }}
                >
                  Skip
                </button>
                <button
                  onClick={() => void submitPinPrompt()}
                  disabled={pinDigits.length !== 4 || pinBusy}
                  className="para-btn-primary"
                  style={{ flex: 1, padding: 12, fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 700 }}
                >
                  {pinBusy ? 'Checking…' : 'Unlock'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes chat-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
