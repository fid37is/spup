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
import { useRouter } from 'next/navigation'
import BackButton from '@/components/ui/back-button'
import {
  Send, X, Trash2, CornerUpLeft, Lock, ChevronDown, Loader2, RefreshCw, WifiOff,
  ImagePlus, Play, AlertCircle, MoreVertical, EyeOff, Flag, Ban,
} from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'
import {
  sendMessageAction, hideConversationAction, deleteMessageAction, loadMessagesAction, markConversationReadAction,
  uploadPublicKeyAction, getPublicKeyAction, getWrappedKeyAction, uploadWrappedKeyAction,
  type ChatMediaInput,
} from '@/lib/actions/messages'
import {
  recoverOrCreateKeyPair, deriveSharedKey, encryptMessage, decryptMessage, isEncrypted,
  UNDECRYPTABLE, WrongPasswordError, getCachedPeerPublicKey, setCachedPeerPublicKey,
} from '@/lib/chat-crypto'
import { getSessionPinMaterial } from '@/lib/chat-pin-session'
import {
  arrange, upsertIncoming, confirmOptimistic, markFailed, markSending, removeMessage,
  applyRowUpdate, mergeFetched, statusOf, findPendingMatch, dayKey, dayLabel, type ChatMsg,
} from '@/lib/chat-message-state'
import type { MessageRow, ReplyRef } from '@/lib/chat-queries'
import MessageStatusIcon from '@/components/chat/message-status'
import { useToast } from '@/components/layout/toast'
import ReportDialog from '@/components/feed/report-dialog'
import { toggleBlockAction } from '@/lib/actions/follows'
import { CHAT_LOCK_COPY, type ChatLockReason } from '@/lib/chat-access'
import { notifyChatUnreadChanged } from '@/hooks/use-chat-unread'
import { patchChatListCache } from '@/lib/chat-list-cache'
import { uploadMedia, UploadCancelledError } from '@/lib/upload-media'
import { compressImageForUpload } from '@/lib/media-client'
import { validateMediaFile, mediaKindOf } from '@/lib/media-limits'
import { useTranslation } from '@/lib/i18n/language-context'

const AVATAR_COLORS = ['#1A9E5F', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A6A1A']
const MAX_TEXT = 4000            // characters per message (the server allows more for ciphertext overhead)
const POLL_MS = 15_000           // safety-net re-sync while the tab is visible (see docs/CHAT_FIXES.md)
const NEAR_BOTTOM_PX = 120

interface Message extends ChatMsg {
  reply_to?: ReplyRef | null
  /** Stable React key: an optimistic bubble keeps it when it gets its real id. */
  _key?: string
}

/** An upload that finished and is staged for the next send. */
interface UploadedChatMedia extends ChatMediaInput {
  localPreview: string   // object URL, for instant display before the real url loads
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
  /** Why this thread is read-only right now (null = you can write). */
  initialLock?: ChatLockReason | null
}

type CryptoState = 'loading' | 'ready' | 'no-peer-key' | 'unavailable'
type RealtimeState = 'connecting' | 'live' | 'down'

const isTouchPrimary = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

export default function ChatClient({
  conversationId, initialMessages, initialHasMore, initialError, currentUserId, otherUser, initialLock = null,
}: ChatClientProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [lock, setLock] = useState<ChatLockReason | null>(initialLock)
  const [showMenu, setShowMenu] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const { error: toastError, success: toastSuccess } = useToast()

  // ── State ──────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>(() => arrange(initialMessages as Message[]))
  const [texts, setTexts] = useState<Record<string, string>>({})   // message id -> plaintext
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)          // message whose action bar is open
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loaded, setLoaded] = useState(false)                        // first client sync finished
  const [loadError, setLoadError] = useState<string | null>(initialError)
  const [cryptoState, setCryptoState] = useState<CryptoState>('loading')
  const [realtime, setRealtime] = useState<RealtimeState>('connecting')
  const [online, setOnline] = useState(true)
  const [unseen, setUnseen] = useState(0)
  const [showJump, setShowJump] = useState(false)

  // Attached photo/video, staged before sending (upload finishes first - keeps
  // the send/optimistic-echo flow simple, and means Retry never re-uploads).
  const [attachment, setAttachment] = useState<UploadedChatMedia | null>(null)
  const [attachUploading, setAttachUploading] = useState(false)
  const [attachProgress, setAttachProgress] = useState(0)
  const [attachError, setAttachError] = useState('')
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video' } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachAbortRef = useRef<AbortController | null>(null)

  // Supplies recoverOrCreateKeyPair() with `${pin}:${pepper}` whenever
  // PinGate (the one and only chat PIN prompt) already unlocked it this
  // page load - never shows any UI of its own. If it's not cached (e.g.
  // this tab reloaded after PinGate took its fast localStorage-only path),
  // recovery is just skipped for this session rather than asking again.
  const getPassword = useCallback((): string | null => {
    const cached = getSessionPinMaterial()
    return cached ? `${cached.pin}:${cached.pepper}` : null
  }, [])

  // ── Refs ───────────────────────────────────────────────────────────────────
  const listRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sbRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)
  const messagesRef = useRef<Message[]>(messages)
  const stickRef = useRef(true)                       // is the view pinned to the latest message?
  const prevLenRef = useRef(0)
  const restoreRef = useRef<{ h: number; top: number } | null>(null)   // keep scroll position when older pages are prepended
  const syncingRef = useRef(false)
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendChainRef = useRef<Promise<void>>(Promise.resolve())
  const outboxRef = useRef(new Map<string, { text: string; replyId: string | null; wire: string | null; media: ChatMediaInput | null }>())

  // Encryption
  const privateKeyRef = useRef<CryptoKey | null>(null)
  const sharedKeyRef = useRef<CryptoKey | null>(null)
  const peerPubRef = useRef<string | null>(null)
  const peerCheckRef = useRef(0)
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
  const otherColor = AVATAR_COLORS[(otherUser.username?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
  const canSend = !!otherUser.id && !lock

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Plaintext to show for a message (or reply target). undefined = still decrypting / no key. */
  function textOf(m: { id: string; body: string | null }): string | null | undefined {
    if (!m.body) return null
    if (texts[m.id] !== undefined) return texts[m.id]
    if (isEncrypted(m.body)) return undefined
    return m.body
  }

  function placeholder(): string {
    return cryptoState === 'loading' ? '…' : t('chat.encrypted_message')
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

  /** Fetch the other person's public key and derive the shared key. false = they have none yet. */
  const connectPeer = useCallback(async (): Promise<boolean> => {
    const priv = privateKeyRef.current
    if (!priv || !otherUser.id) return false

    // Fast path: decrypt with whatever public key we saw from them last time,
    // immediately, before the network round trip below even resolves - this is
    // what lets existing messages show up as soon as the chat opens instead of
    // a beat later. Wrong or stale by the time the fetch below returns just
    // means a moment of "no key yet" and then it's silently corrected.
    if (!sharedKeyRef.current) {
      const cachedPub = getCachedPeerPublicKey(currentUserId, otherUser.id)
      if (cachedPub) {
        const shared = await deriveSharedKey(priv, cachedPub)
        peerPubRef.current = cachedPub
        sharedKeyRef.current = shared
        setSharedKey(shared)
        setCryptoState('ready')
      }
    }

    const { publicKey } = await getPublicKeyAction(otherUser.id)
    if (!publicKey) return !!sharedKeyRef.current
    if (publicKey === peerPubRef.current && sharedKeyRef.current) return true
    const shared = await deriveSharedKey(priv, publicKey)
    const changed = peerPubRef.current !== null && peerPubRef.current !== publicKey
    peerPubRef.current = publicKey
    sharedKeyRef.current = shared
    setSharedKey(shared)
    setCryptoState('ready')
    setCachedPeerPublicKey(currentUserId, otherUser.id, publicKey)
    // They re-keyed (new device): anything we failed to open may open now.
    if (changed) setTexts(t => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== UNDECRYPTABLE)))
    return true
  }, [otherUser.id, currentUserId])

  /** Throttled re-check: the other person may have opened Chat since we did (or re-keyed). */
  const recheckPeerKey = useCallback(async () => {
    if (!privateKeyRef.current) return
    if (Date.now() - peerCheckRef.current < 10_000) return
    peerCheckRef.current = Date.now()
    try { await connectPeer() } catch { /* try again next time */ }
  }, [connectPeer])

  useEffect(() => {
    let cancelled = false
      ; (async () => {
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
            // The cached PIN+pepper didn't unlock the saved key - a data
            // inconsistency, not a user mistake (PinGate already verified the
            // PIN server-side before this ever runs).
            console.warn('Chat key recovery: PIN did not unlock the saved key', e)
          } else {
            console.warn('Crypto init failed - messages will be unencrypted', e)
          }
          setCryptoState('unavailable')
        } finally {
          // Only the run that is still current may settle, otherwise React
          // StrictMode's first (cancelled) run would release queued sends early.
          if (!cancelled) settledRef.current?.resolve()
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
      ; (async () => {
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
      patchChatListCache(currentUserId, conversationId, { unread_count: 0 })   // the chat list (shown instantly from cache) must not still show this as unread
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
      if (!opts.silent || messagesRef.current.length === 0) setLoadError(t('chat.could_not_reach_server'))
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

  // Revoke the staged attachment's local object URL if the person navigates
  // away (or switches conversations) before sending it.
  const attachmentRef = useRef<UploadedChatMedia | null>(null)
  attachmentRef.current = attachment
  useEffect(() => {
    return () => { if (attachmentRef.current) URL.revokeObjectURL(attachmentRef.current.localPreview) }
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
    // A message only ends up marked failed after a real send attempt threw
    // (see `deliver` above) - never from a timeout guess - so retrying it
    // automatically here can't double-send. On a flaky connection this is
    // the difference between "type it once" and "keep tapping retry every
    // time a bar of signal comes back".
    const retryFailedSends = () => {
      for (const m of messagesRef.current) {
        if (m._optimistic && m._failed) retrySend(m.id)
      }
    }
    const wake = () => {
      if (document.visibilityState !== 'visible') return
      void latest.current.syncLatest({ silent: true })
      latest.current.scheduleAck()
      retryFailedSends()
    }
    const onOnline = () => { setOnline(true); wake() }
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
      if (res.error) { toastError(t('chat.could_not_load_earlier')); return }
      const el = listRef.current
      if (el && res.messages.length > 0) restoreRef.current = { h: el.scrollHeight, top: el.scrollTop }
      setMessages(prev => mergeFetched(prev, res.messages as Message[]))
      setHasMore(res.hasMore)
    } catch {
      toastError(t('chat.could_not_load_earlier'))
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
      if (item.wire === null && item.text) {
        if (!sharedKeyRef.current && privateKeyRef.current) await connectPeer().catch(() => false)
        item.wire = sharedKeyRef.current ? await encryptMessage(item.text, sharedKeyRef.current) : item.text
        const wire = item.wire
        // The wire body is what the realtime echo is matched against.
        setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, body: wire } : m)))
      }
      const res = await sendMessageAction(conversationId, item.wire ?? '', item.replyId ?? undefined, item.media ?? undefined)
      if (!('success' in res) || !res.success) {
        const code = (res as { code?: string }).code
        if (code === 'blocked_by_me' || code === 'not_mutual') {
          // Not a connection problem: this will never succeed, so don't leave
          // it as "Not sent · Retry" (which the auto-retry would hammer).
          outboxRef.current.delete(tempId)
          setMessages(prev => removeMessage(prev, tempId))
          setTexts(tx => { const { [tempId]: _drop, ...rest } = tx; return rest })
          setLock(code)
          toastError(CHAT_LOCK_COPY[code])
          return
        }
        if (code === 'suspended') {
          // Suspended accounts can read chats but not send: drop it (a retry would
          // be refused too) and say until when.
          outboxRef.current.delete(tempId)
          setMessages(prev => removeMessage(prev, tempId))
          setTexts(tx => { const { [tempId]: _drop, ...rest } = tx; return rest })
          toastError(('error' in res && res.error) || 'Your account is suspended.')
          return
        }
        throw new Error(('error' in res && res.error) || t('chat.send_failed'))
      }
      outboxRef.current.delete(tempId)
      if (item.text) setTexts(t => ({ ...t, [res.messageId]: item.text }))
      setMessages(prev => confirmOptimistic(prev, tempId, { id: res.messageId, created_at: res.createdAt }))
      // The chat list is drawn from a cache when you go back to it: move this chat to the top now.
      patchChatListCache(currentUserId, conversationId, {
        last_message_preview: item.wire ? (item.wire.startsWith('enc:') ? item.wire : item.wire.slice(0, 80)) : (item.media ? (item.media.type === 'video' ? 'Video' : 'Photo') : null),
        last_message_at: res.createdAt,
        last_message_mine: true,
        last_message_status: 'sent',
      })
    } catch (e) {
      if (!outboxRef.current.has(tempId)) return
      console.warn('[chat] send failed:', e)
      setMessages(prev => markFailed(prev, tempId))
    }
  }, [conversationId, connectPeer, currentUserId])

  const enqueue = useCallback((tempId: string) => {
    sendChainRef.current = sendChainRef.current.then(() => deliver(tempId)).catch(() => { })
  }, [deliver])

  // ── Attachments ────────────────────────────────────────────────────────────

  function openFilePicker() {
    setAttachError('')
    fileInputRef.current?.click()
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''   // lets picking the same file twice re-trigger onChange
    if (!file) return

    const kind = mediaKindOf(file)
    const validationError = validateMediaFile(file)
    if (!kind || validationError) {
      setAttachError(validationError || t('chat.file_type_not_supported'))
      return
    }

    setAttachError('')
    setAttachUploading(true)
    setAttachProgress(0)
    const localPreview = URL.createObjectURL(file)
    const controller = new AbortController()
    attachAbortRef.current = controller

    try {
      const toSend = kind === 'image' ? await compressImageForUpload(file) : file
      const result = await uploadMedia(toSend, kind, pct => setAttachProgress(pct), controller.signal)
      setAttachment({
        url: result.url,
        type: result.media_type,
        thumbnail_url: result.thumbnail_url,
        width: result.width,
        height: result.height,
        duration_secs: result.duration_secs,
        size_bytes: result.size_bytes,
        localPreview,
      })
    } catch (err) {
      URL.revokeObjectURL(localPreview)
      if (!(err instanceof UploadCancelledError)) {
        setAttachError(err instanceof Error && err.message ? err.message : t('profile.upload_failed_connection'))
      }
    } finally {
      setAttachUploading(false)
      setAttachProgress(0)
      attachAbortRef.current = null
    }
  }

  function cancelAttachUpload() {
    attachAbortRef.current?.abort()
  }

  function removeAttachment() {
    if (attachment) URL.revokeObjectURL(attachment.localPreview)
    setAttachment(null)
    setAttachError('')
  }

  function handleSend() {
    const text = body.trim()
    const media = attachment
    if ((!text && !media) || !canSend || attachUploading) return
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
      media_url: media?.url ?? null,
      media_type: media?.type ?? null,
      media_width: media?.width ?? null,
      media_height: media?.height ?? null,
      _optimistic: true,
    }
    const mediaInput: ChatMediaInput | null = media
      ? { url: media.url, type: media.type, thumbnail_url: media.thumbnail_url, width: media.width, height: media.height, duration_secs: media.duration_secs, size_bytes: media.size_bytes }
      : null
    if (media) URL.revokeObjectURL(media.localPreview)   // already uploaded - the bubble uses the real hosted url below
    outboxRef.current.set(tempId, { text, replyId: reply?.id ?? null, wire: null, media: mediaInput })
    if (text) setTexts(t => ({ ...t, [tempId]: text }))
    stickRef.current = true
    setMessages(prev => arrange([...prev, optimistic]))
    setBody('')
    setReplyTo(null)
    setAttachment(null)
    if (inputRef.current) inputRef.current.style.height = 'auto'
    enqueue(tempId)
  }

  async function handleHideChat() {
    setShowMenu(false)
    const r = await hideConversationAction(conversationId).catch(() => ({ error: 'network' }))
    if ('error' in r) { toastError(t('chat.send_failed')); return }
    toastSuccess('Chat hidden')
    router.push('/messages')
  }

  async function handleToggleBlock() {
    setShowMenu(false)
    const r = await toggleBlockAction(otherUser.id).catch(() => ({ error: 'network' }))
    if ('error' in r) { toastError(String(r.error)); return }
    // Unblocking does not restore follows, so the thread stays read-only until you follow each other again.
    setLock(r.blocked ? 'blocked_by_me' : 'not_mutual')
    toastSuccess(r.blocked ? `Blocked @${otherUser.username}` : `Unblocked @${otherUser.username}`)
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
      toastError(t('chat.could_not_delete'))
    }
  }

  async function handleCopy(m: Message) {
    const plaintext = textOf(m)
    if (!plaintext) return
    try { await navigator.clipboard.writeText(plaintext); toastSuccess(t('chat.copied')) } catch { toastError(t('chat.could_not_copy')) }
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
        ? { text: t('chat.end_to_end_encrypted'), lock: true }
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
        <BackButton fallbackHref="/messages" />
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

        {otherUser.id && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              aria-label="Chat options"
              onClick={() => setShowMenu(v => !v)}
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <MoreVertical size={18} />
            </button>
            {showMenu && (
              <>
                <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50, minWidth: 200,
                  background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
                  borderRadius: 14, padding: 4, boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
                }}>
                  {[
                    { icon: <EyeOff size={16} />, label: 'Hide chat', onClick: handleHideChat, danger: false },
                    { icon: <Flag size={16} />, label: `Report @${otherUser.username}`, onClick: () => { setShowMenu(false); setShowReport(true) }, danger: true },
                    { icon: <Ban size={16} />, label: lock === 'blocked_by_me' ? `Unblock @${otherUser.username}` : `Block @${otherUser.username}`, onClick: handleToggleBlock, danger: lock !== 'blocked_by_me' },
                  ].map(item => (
                    <button
                      key={item.label}
                      onClick={item.onClick}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 16px',
                        background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, textAlign: 'left',
                        fontFamily: "'DM Sans', sans-serif",
                        color: item.danger ? 'var(--color-error)' : 'var(--color-text-primary)',
                      }}
                    >
                      {item.icon} {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showReport && (
        <ReportDialog entityType="user" entityId={otherUser.id} subject={`@${otherUser.username}`} onClose={() => setShowReport(false)} />
      )}

      {/* Messages */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          ref={listRef}
          data-chat-messages
          role="log"
          aria-live="polite"
          onScroll={onListScroll}
          onClick={() => setSelectedId(null)}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '12px 16px' }}
        >
          <div ref={contentRef}>

            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
                <button onClick={e => { e.stopPropagation(); void loadOlder() }} disabled={loadingOlder} style={pillBtn}>
                  {loadingOlder ? <Loader2 size={13} style={{ animation: 'chat-spin 0.8s linear infinite' }} /> : null}
                  {loadingOlder ? t('feed.new_posts_loading') : t('chat.load_earlier')}
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
              const hasMedia = !msg.is_deleted && !!msg.media_url
              const hasCaption = hasMedia && text !== null && text !== undefined && text !== UNDECRYPTABLE

              const replyText = msg.reply_to
                ? (msg.reply_to.is_deleted || (msg.reply_to.body === null && !msg.reply_to.media_type)
                  ? t('chat.message_deleted')
                  : msg.reply_to.body === null && msg.reply_to.media_type
                    ? (msg.reply_to.media_type === 'video' ? t('notif.video') : t('notif.photo'))
                    : (textOf(msg.reply_to) ?? placeholder()))
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
                      aria-label={canAct ? t('chat.message_options') : undefined}
                      onClick={e => { e.stopPropagation(); if (canAct) setSelectedId(selected ? null : msg.id) }}
                      onKeyDown={e => { if (canAct && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelectedId(selected ? null : msg.id) } }}
                      style={{
                        background: isMine ? 'var(--color-brand)' : 'var(--color-surface-2)',
                        color: isMine ? 'white' : 'var(--color-text-primary)',
                        padding: hasMedia ? '6px' : '9px 13px',
                        borderRadius: isMine
                          ? (grouped ? '18px 4px 4px 18px' : '18px 4px 18px 18px')
                          : (grouped ? '4px 18px 18px 4px' : '4px 18px 18px 18px'),
                        // While `text === undefined` (still decrypting), the bubble's only
                        // content is a one-character placeholder ('…'), so it collapses to a
                        // tiny near-circular blob and then visibly snaps/grows once the real
                        // text arrives. A stable min-width keeps that from reading as two
                        // different UI states flashing past each other.
                        minWidth: text === undefined && !hasMedia ? 56 : undefined,
                        width: hasMedia ? 220 : undefined,
                        // A bubble can never be wider than its column. Without this, a reply
                        // quote (single-line, nowrap) made the bubble as wide as the whole
                        // quoted text and pushed it off screen, so the chat scrolled sideways.
                        maxWidth: '100%', boxSizing: 'border-box',
                        fontSize: 14, lineHeight: 1.5,
                        fontFamily: "'DM Sans', sans-serif",
                        wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap',
                        opacity: msg._optimistic && !msg._failed ? 0.72 : 1,
                        outline: msg._failed ? '1px solid var(--color-border)' : selected ? '2px solid var(--color-brand-hover)' : 'none',
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
                            borderRadius: 8, padding: '5px 9px', margin: hasMedia ? '0 0 6px' : '0 0 6px', whiteSpace: 'normal',
                            minWidth: 0, maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box',
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 1, color: isMine ? 'rgba(255,255,255,0.9)' : 'var(--color-brand)' }}>
                            {nameOf(msg.reply_to.sender_id)}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                            {replyText}
                          </div>
                        </div>
                      )}

                      {hasMedia && (
                        <div
                          onClick={e => { e.stopPropagation(); if (msg.media_url && !msg._optimistic) setLightbox({ url: msg.media_url, type: msg.media_type === 'video' ? 'video' : 'image' }) }}
                          style={{
                            position: 'relative', borderRadius: 12, overflow: 'hidden',
                            marginBottom: hasCaption ? 6 : 0, cursor: 'pointer', background: 'rgba(0,0,0,0.15)',
                            aspectRatio: msg.media_width && msg.media_height ? `${msg.media_width} / ${msg.media_height}` : '4 / 3',
                          }}
                        >
                          {msg.media_type === 'video' ? (
                            <>
                              {msg.media_thumbnail_url
                                ? <img src={msg.media_thumbnail_url} alt={t('chat.video_attachment_alt')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                : <video src={msg.media_url ?? undefined} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                              }
                              <div style={{
                                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <div style={{
                                  width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.5)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  <Play size={18} color="white" fill="white" style={{ marginLeft: 2 }} />
                                </div>
                              </div>
                            </>
                          ) : (
                            <img src={msg.media_url ?? undefined} alt={t('chat.photo_attachment_alt')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          )}
                        </div>
                      )}

                      {msg.is_deleted
                        ? <em style={{ opacity: 0.6, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Trash2 size={12} /> {t('chat.message_deleted')}</em>
                        : failedDecrypt
                          ? <em style={{ opacity: 0.7, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Lock size={12} /> {t('chat.cant_open_on_device')}</em>
                          : hasMedia
                            ? (hasCaption ? <span style={{ padding: '0 7px 3px' }}>{text}</span> : null)
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
                          <button style={pillBtn} onClick={e => { e.stopPropagation(); void handleCopy(msg) }}>{t('chat.copy')}</button>
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
                          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Not sent</span>
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
            aria-label={unseen > 0 ? t('chat.jump_to_latest_new', { count: unseen }) : t('chat.jump_to_latest')}
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
              {replyTo.body === null && replyTo.media_type
                ? (replyTo.media_type === 'video' ? t('notif.video') : t('notif.photo'))
                : (textOf(replyTo) ?? placeholder())}
            </div>
          </div>
          <button aria-label="Cancel reply" onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Offline notice - a calm heads-up, not an error state. Individual
          failed sends already get a quiet "Not sent · Retry" of their own;
          this is just letting the person know why, in one place, instead of
          reading it off every affected message. */}
      {!online && (
        <div style={{
          margin: '0 12px 8px', padding: '9px 14px',
          background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
          borderRadius: 14, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12.5, color: 'var(--color-text-secondary)', fontFamily: "'DM Sans', sans-serif",
        }}>
          <WifiOff size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
          You&apos;re offline — messages will send once you&apos;re back online.
        </div>
      )}

      {/* Attachment preview - staged before sending */}
      {(attachment || attachUploading || attachError) && (
        <div style={{
          margin: '0 12px 8px', padding: 10,
          background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
          borderRadius: 14, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {(attachment || attachUploading) && (
            <div style={{ position: 'relative', width: 46, height: 46, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--color-surface-3)' }}>
              {attachment && (
                attachment.type === 'video'
                  ? (attachment.thumbnail_url
                    ? <img src={attachment.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <video src={attachment.localPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />)
                  : <img src={attachment.localPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              {attachUploading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 size={16} color="white" style={{ animation: 'chat-spin 0.8s linear infinite' }} />
                </div>
              )}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {attachError ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--color-error)' }}>
                <AlertCircle size={13} style={{ flexShrink: 0 }} /> {attachError}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                {attachUploading ? t('chat.uploading_percent', { percent: attachProgress }) : attachment?.type === 'video' ? t('chat.video_attached') : t('chat.photo_attached')}
              </div>
            )}
          </div>
          <button
            aria-label={attachUploading ? t('chat.cancel_upload') : t('chat.remove_attachment')}
            onClick={attachUploading ? cancelAttachUpload : removeAttachment}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', flexShrink: 0, padding: 4 }}
          >
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,video/mov,video/avi"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />
          <button
            aria-label={t('chat.attach_photo_video')}
            onClick={openFilePicker}
            disabled={attachUploading || !!attachment}
            style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: attachUploading || !!attachment ? 'default' : 'pointer',
              opacity: attachUploading || !!attachment ? 0.5 : 1,
            }}
          >
            <ImagePlus size={18} color="var(--color-text-secondary)" />
          </button>
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
            aria-label={t('chat.message_input_aria')}
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
            aria-label={t('chat.send_message')}
            onMouseDown={e => e.preventDefault()}   // keep the keyboard open on the phone
            onClick={handleSend}
            disabled={(!body.trim() && !attachment) || attachUploading}
            style={{
              width: 42, height: 42, borderRadius: '50%',
              background: (body.trim() || attachment) && !attachUploading ? 'var(--color-brand)' : 'var(--color-surface-2)',
              border: 'none', cursor: (body.trim() || attachment) && !attachUploading ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 0.2s',
            }}
          >
            <Send size={17} color={(body.trim() || attachment) && !attachUploading ? 'white' : 'var(--color-text-muted)'} />
          </button>
        </div>
      ) : lock ? (
        <div
          data-testid="chat-locked"
          style={{
            padding: '14px 16px', paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
            textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-secondary)',
            borderTop: '1px solid var(--color-border)', background: 'var(--nav-bg)', flexShrink: 0,
          }}
        >
          {CHAT_LOCK_COPY[lock]}
          {lock === 'blocked_by_me' && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={handleToggleBlock}
                style={{ background: 'var(--color-brand)', color: 'white', border: 'none', borderRadius: 20, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}
              >
                Unblock
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
          This account no longer exists, so you can&apos;t send messages here.
        </div>
      )}

      {/* Media lightbox */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.type === 'video' ? t('notif.video') : t('notif.photo')}
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'max(16px, env(safe-area-inset-top, 0px)) 16px 16px',
          }}
        >
          <button
            aria-label={t('chat.close')}
            onClick={() => setLightbox(null)}
            style={{
              position: 'absolute', top: 'max(16px, env(safe-area-inset-top, 0px))', right: 16,
              width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.12)',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={20} color="white" />
          </button>
          {lightbox.type === 'video' ? (
            <video
              src={lightbox.url}
              controls
              autoPlay
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }}
            />
          ) : (
            <img
              src={lightbox.url}
              alt=""
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, objectFit: 'contain' }}
            />
          )}
        </div>
      )}

      <style>{`@keyframes chat-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}