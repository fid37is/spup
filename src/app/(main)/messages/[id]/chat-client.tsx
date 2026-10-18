'use client'

// src/app/(main)/messages/[id]/chat-client.tsx
//
// The conversation screen. See docs/CHAT_FIXES.md for the reasoning behind the
// structure; the short version:
//   - `messages` holds the rows. Decrypted text lives outside them, in a cache keyed by
//     ciphertext (lib/chat-thread-cache.ts), so decrypting can never overwrite or drop a
//     message, an edit (new ciphertext) just decrypts again, and re-opening a chat is instant.
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
  ImagePlus, Play, AlertCircle, MoreVertical, EyeOff, Flag, Ban, Pencil, Check, Copy, Eye,
} from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'
import {
  sendMessageAction, hideConversationAction, deleteMessageAction, editMessageAction, loadMessagesAction, markConversationReadAction,
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
import ChatMediaViewer from '@/components/chat/chat-media-viewer'
import MessageActionsPopup, { type MenuItem } from '@/components/chat/message-actions-popup'
import { useMessageGestures } from '@/hooks/use-message-gestures'
import { useToast } from '@/components/layout/toast'
import ReportDialog from '@/components/feed/report-dialog'
import { toggleBlockAction } from '@/lib/actions/follows'
import { CHAT_LOCK_COPY, type ChatLockReason } from '@/lib/chat-access'
import { notifyChatUnreadChanged } from '@/hooks/use-chat-unread'
import { patchChatListCache, sharedPreviewKeys } from '@/lib/chat-list-cache'
import { readThreadCache, writeThreadCache, plainTextCache } from '@/lib/chat-thread-cache'
import { onTyping, createTypingEmitter, TYPING_TTL_MS } from '@/lib/chat-typing'
import { uploadMedia, UploadCancelledError } from '@/lib/upload-media'
import { compressImageForUpload } from '@/lib/media-client'
import { validateMediaFile, mediaKindOf } from '@/lib/media-limits'
import { useTranslation } from '@/lib/i18n/language-context'
import { prepareDmLinksAction } from '@/lib/actions/links'
import { extractLinkTokens, applyReplacements } from '@/lib/link-safety/extract'
import { isOwnHost } from '@/lib/link-safety/short-link'
import { linkifyShortLinks } from '@/components/shared/linkify'

const AVATAR_COLORS = ['#1A9E5F', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A6A1A']
const MAX_TEXT = 4000            // characters per message (the server allows more for ciphertext overhead)
const POLL_MS = 15_000           // safety-net re-sync while the tab is visible (see docs/CHAT_FIXES.md)
const NEAR_BOTTOM_PX = 120
const PAINT_HOLD_MAX_MS = 700    // longest the first paint of a thread waits for its cached messages to decrypt

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

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
  /** Optional: the page no longer fetches messages on the server - the screen paints from its on-device copy. */
  initialMessages?: MessageRow[]
  initialHasMore?: boolean
  initialError?: string | null
  currentUserId: string
  otherUser: OtherUser
  /** Why this thread is read-only right now (null = you can write). */
  initialLock?: ChatLockReason | null
}

type CryptoState = 'loading' | 'ready' | 'no-peer-key' | 'unavailable'
type RealtimeState = 'connecting' | 'live' | 'down'

const isTouchPrimary = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/**
 * Checks the web addresses in an outgoing message (see deliver()) and returns the text with each
 * replaced by its short link. Links to Spup itself are left alone and need no check.
 */
async function prepareDmText(text: string): Promise<{ text: string; blocked: boolean }> {
  const external = extractLinkTokens(text).filter(tok => {
    try { return !isOwnHost(new URL(/^https?:\/\//i.test(tok.raw) ? tok.raw : `https://${tok.raw}`).hostname) } catch { return true }
  })
  if (external.length === 0) return { text, blocked: false }

  const res = await prepareDmLinksAction([...new Set(external.map(tok => tok.raw))])
  if ('error' in res) throw Object.assign(new Error(res.error), { code: res.code })
  if (res.results.some(r => r.action === 'blocked')) return { text, blocked: true }

  const replacements = new Map<string, string>()
  for (const r of res.results) if (r.action === 'replace') replacements.set(r.raw, r.replacement)
  return { text: applyReplacements(text, extractLinkTokens(text), replacements), blocked: false }
}

/** The message these replies quoted was deleted: they keep the quote's name but no longer show its text. */
function markQuotesDeleted(list: Message[], id: string): Message[] {
  return list.map(m =>
    m.reply_to && m.reply_to.id === id && !m.reply_to.is_deleted
      ? { ...m, reply_to: { ...m.reply_to, body: null, is_deleted: true } }
      : m)
}

export default function ChatClient({
  conversationId, initialMessages = [], initialHasMore = false, initialError = null, currentUserId, otherUser, initialLock = null,
}: ChatClientProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [lock, setLock] = useState<ChatLockReason | null>(initialLock)
  const [showMenu, setShowMenu] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const { error: toastError, success: toastSuccess } = useToast()

  // ── State ──────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>(() => arrange(initialMessages as Message[]))
  // Plaintext of MY pending (optimistic) sends, by temp id, so the bubble shows what I typed before it has a wire
  // body. Everything else is read from the decrypted-text cache (lib/chat-thread-cache.ts), keyed by ciphertext.
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [plainVersion, bumpPlain] = useState(0)                       // the decrypted-text cache gained entries
  const [paintOpen, setPaintOpen] = useState(false)                   // first paint no longer held back for decrypting
  const [peerTyping, setPeerTyping] = useState(false)
  const [editing, setEditing] = useState<Message | null>(null)         // message being edited (composer is in edit mode)
  const [editSaving, setEditSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  // The message whose options menu is open (anchored popup, see components/chat/message-actions-popup.tsx).
  const [menu, setMenu] = useState<{ id: string; keyboard: boolean } | null>(null)
  const selectedId = menu?.id ?? null
  const setSelectedId = (id: string | null) => setMenu(id ? { id, keyboard: false } : null)
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
  // The photo/video open in the full-screen viewer, plus the message it belongs to (so a reply typed in the viewer quotes it).
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video'; msg: Message } | null>(null)
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
  const typingRef = useRef<ReturnType<typeof createTypingEmitter> | null>(null)
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
  function textOf(m: { id: string; body: string | null; _optimistic?: boolean }): string | null | undefined {
    if (m._optimistic && texts[m.id] !== undefined) return texts[m.id]   // my own pending send: what I typed
    if (!m.body) return null
    if (isEncrypted(m.body)) return plainTextCache.get(m.body)           // undefined = still decrypting
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
        sharedPreviewKeys.set(`${currentUserId}:${otherUser.id}`, shared)   // next visit starts with it already derived
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
    sharedPreviewKeys.set(`${currentUserId}:${otherUser.id}`, shared)
    setSharedKey(shared)
    setCryptoState('ready')
    setCachedPeerPublicKey(currentUserId, otherUser.id, publicKey)
    // They re-keyed (new device): anything we failed to open may open now.
    if (changed) {
      for (const [k, v] of plainTextCache) if (v === UNDECRYPTABLE) plainTextCache.delete(k)
      bumpPlain(n => n + 1)
    }
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
          // Publishing my public key is bookkeeping: it must not sit between opening the chat and decrypting it
          // (it used to be awaited here - a full server round trip on every visit before any text could show).
          void uploadPublicKeyAction(publicKeyB64).catch(() => { /* retried on the next visit */ })
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

  // Decrypt whatever needs it. Writes ONLY to the decrypted-text cache (keyed by ciphertext), never to
  // `messages` - so an edited message (new ciphertext) simply decrypts again, and a thread opened a second
  // time finds everything already decrypted.
  useEffect(() => {
    if (!sharedKey) return
    const todo: string[] = []
    const want = (body: string | null | undefined) => {
      if (body && isEncrypted(body) && plainTextCache.get(body) === undefined && !todo.includes(body)) todo.push(body)
    }
    for (const m of messages) {
      if (!m.is_deleted) want(m.body)
      const r = m.reply_to
      if (r && !r.is_deleted) want(r.body)
    }
    if (todo.length === 0) return
    let cancelled = false
      ; (async () => {
        const done = await Promise.all(todo.map(async body => [body, await decryptMessage(body, sharedKey)] as const))
        if (cancelled) return
        for (const [body, text] of done) if (!plainTextCache.has(body)) plainTextCache.set(body, text)
        bumpPlain(n => n + 1)
        if (done.some(([, t]) => t === UNDECRYPTABLE)) void recheckPeerKey()
      })()
    return () => { cancelled = true }
  }, [messages, sharedKey, plainVersion, recheckPeerKey])

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
      // The phone's copy can be older than a whole page (more than a page of new messages while away).
      // Merging then would leave a hole in the middle of the thread, so start again from the latest page.
      const confirmed = messagesRef.current.filter(m => !m._optimistic)
      const newestKnown = confirmed.length > 0 ? confirmed[confirmed.length - 1].created_at : null
      const gap = res.hasMore && res.messages.length > 0 && newestKnown !== null &&
        Date.parse(res.messages[0].created_at) > Date.parse(newestKnown)
      if (confirmed.length === 0 || gap) setHasMore(res.hasMore)
      setMessages(prev => gap
        ? arrange([...prev.filter(m => m._optimistic), ...(res.messages as Message[])])
        : mergeFetched(prev, res.messages as Message[]))
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
    if (row.sender_id !== currentUserId) setPeerTyping(false)   // their message arrived: they are no longer "typing…"
    // (The echo of my own send needs no plaintext carry-over: deliver() already put it in the decrypted-text
    // cache under the ciphertext it sent, which is exactly what the echo carries.)
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

  // The on-device copy first: the thread (and the key to read it) is on screen before any network call,
  // and a layout effect runs before the browser paints - so there is no empty or "…" frame. New messages
  // then catch up through the sync below, which is a silent top-up, not a loading state.
  useIsoLayoutEffect(() => {
    const cached = readThreadCache(currentUserId, conversationId)
    if (cached && cached.messages.length > 0) {
      setMessages(cur => (cur.length === 0 ? arrange(cached.messages as Message[]) : mergeFetched(cur, cached.messages as Message[])))
      setHasMore(cached.hasMore)
      setLoaded(true)
    }
    const key = otherUser.id ? sharedPreviewKeys.get(`${currentUserId}:${otherUser.id}`) : null
    if (key && !sharedKeyRef.current) {
      sharedKeyRef.current = key
      peerPubRef.current = getCachedPeerPublicKey(currentUserId, otherUser.id)
      setSharedKey(key)
      setCryptoState('ready')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  // Keep the on-device copy current (newest page, confirmed rows only; written to storage shortly after).
  useEffect(() => {
    if (!loaded) return
    writeThreadCache(currentUserId, conversationId, messages.filter(m => !m._optimistic) as MessageRow[], hasMore)
  }, [messages, hasMore, loaded, currentUserId, conversationId])

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
        setMessages(prev => {
          const next = applyRowUpdate(prev, payload.new)
          return payload.new?.is_deleted === true ? markQuotesDeleted(next, payload.new.id) : next
        })
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

  // The other person typing to me (broadcast, see lib/chat-typing.ts). Ends on their "stopped", on their
  // message arriving, or - if they just vanished - after TYPING_TTL_MS without a refresh.
  useEffect(() => {
    if (!otherUser.id) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = onTyping(currentUserId, e => {
      if (e.from !== otherUser.id || e.conversationId !== conversationId) return
      if (timer) clearTimeout(timer)
      if (!e.typing) { setPeerTyping(false); return }
      setPeerTyping(true)
      timer = setTimeout(() => setPeerTyping(false), TYPING_TTL_MS)
    })
    return () => { off(); if (timer) clearTimeout(timer); setPeerTyping(false) }
  }, [currentUserId, otherUser.id, conversationId])

  // Me typing to them.
  useEffect(() => {
    if (!otherUser.id || !canSend) return
    const emitter = createTypingEmitter(currentUserId, otherUser.id, conversationId)
    typingRef.current = emitter
    return () => { emitter.stop(); typingRef.current = null }
  }, [currentUserId, otherUser.id, conversationId, canSend])

  // The "are you sure?" on Delete never outlives the selection it belonged to.
  useEffect(() => { setConfirmDeleteId(null) }, [selectedId])

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
        // Link safety. The message is encrypted on this phone, so the server never sees it; only the
        // web addresses in it are sent to be checked. A checked address comes back as a short link
        // (spup.live/l/...), an unsafe one stops the message. Offline / server trouble throws, so the
        // message just shows "Not sent · Retry" like any other failed send.
        const checked = await prepareDmText(item.text).catch((e: any) => {
          if (e?.code === 'suspended') return { suspended: String(e.message) } as const
          throw e
        })
        if ('suspended' in checked) {
          outboxRef.current.delete(tempId)
          setMessages(prev => removeMessage(prev, tempId))
          setTexts(tx => { const { [tempId]: _drop, ...rest } = tx; return rest })
          toastError(checked.suspended || 'Your account is suspended.')
          return
        }
        if (checked.blocked) {
          outboxRef.current.delete(tempId)
          setMessages(prev => removeMessage(prev, tempId))
          setTexts(tx => { const { [tempId]: _drop, ...rest } = tx; return rest })
          toastError(t('links.cant_share'))
          return
        }
        if (checked.text !== item.text) {
          item.text = checked.text
          setTexts(tx => ({ ...tx, [tempId]: checked.text }))
        }
        if (!sharedKeyRef.current && privateKeyRef.current) await connectPeer().catch(() => false)
        item.wire = sharedKeyRef.current ? await encryptMessage(item.text, sharedKeyRef.current) : item.text
        const wire = item.wire
        if (isEncrypted(wire)) plainTextCache.set(wire, item.text)   // what I sent needs no decrypting, now or on the echo
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
  }, [conversationId, connectPeer, currentUserId, t])

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

  // Adds one outgoing message to the thread (optimistically) and queues it for sending.
  // Shared by the composer's Send button and the reply field inside the media viewer.
  function queueMessage(text: string, media: UploadedChatMedia | null, reply: Message | null) {
    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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
    enqueue(tempId)
  }

  function handleSend() {
    if (editing) { void submitEdit(); return }
    const text = body.trim()
    const media = attachment
    if ((!text && !media) || !canSend || attachUploading) return
    typingRef.current?.stop()
    queueMessage(text, media, replyTo)
    setBody('')
    setReplyTo(null)
    setAttachment(null)
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  // Reply typed under a photo/video in the viewer: a normal message quoting that photo/video.
  function sendReplyFromViewer(target: Message, text: string): boolean {
    if (!canSend || !text) return false
    queueMessage(text, null, target)
    return true
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
    if (e.key === 'Escape' && editing) { e.preventDefault(); cancelEdit(); return }
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
    setConfirmDeleteId(null)
    if (editing?.id === id) cancelEdit()
    // Gone from the screen straight away. A deleted message leaves no placeholder behind (deleted rows are
    // not drawn at all) - and any reply that quoted it stops showing its text.
    setMessages(prev => markQuotesDeleted(prev.map(m => (m.id === id ? { ...m, is_deleted: true, body: null, media_url: null } : m)), id))
    const res = await deleteMessageAction(id).catch(() => ({ error: 'network' }))
    if (res && 'error' in res && res.error) {
      setMessages(prev => prev.map(m => (m.id === id ? snapshot : m)))
      toastError(t('chat.could_not_delete'))
      return
    }
    // The chat list is drawn from a cache when you go back to it: it must not keep showing the deleted
    // message as the last one.
    if (res && 'listUpdate' in res && res.listUpdate) {
      const { preview, lastMessageAt } = res.listUpdate
      const newest = [...messagesRef.current].reverse().find(m => !m.is_deleted && !m._optimistic)
      const newestIsLast = !!newest && !!lastMessageAt && Date.parse(newest.created_at) === Date.parse(lastMessageAt)
      const mine = newestIsLast && newest!.sender_id === currentUserId
      patchChatListCache(currentUserId, conversationId, {
        last_message_preview: preview,
        ...(lastMessageAt ? { last_message_at: lastMessageAt } : {}),
        ...(newestIsLast
          ? { last_message_mine: mine, last_message_status: mine ? (newest!.read_at ? 'read' : newest!.delivered_at ? 'delivered' : 'sent') : null }
          : {}),
      })
    }
  }

  // ── Editing ────────────────────────────────────────────────────────────────

  function startEdit(m: Message) {
    const current = textOf(m)
    if (!current || current === UNDECRYPTABLE || !canSend) return
    setSelectedId(null)
    setConfirmDeleteId(null)
    setReplyTo(null)
    setEditing(m)
    setBody(current)
    typingRef.current?.stop()
    requestAnimationFrame(() => {
      const ta = inputRef.current
      if (!ta) return
      ta.focus()
      ta.style.height = 'auto'
      ta.style.height = ta.scrollHeight + 'px'
      ta.setSelectionRange(ta.value.length, ta.value.length)
    })
  }

  function cancelEdit() {
    setEditing(null)
    setBody('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  async function submitEdit() {
    const target = editing
    const text = body.trim()
    if (!target || !text || editSaving || !canSend) return
    if (text === textOf(target)) { cancelEdit(); return }   // nothing changed
    setEditSaving(true)
    try {
      await settledRef.current!.promise                      // same rule as sending: know whether we can encrypt first
      // Same link safety as a new message (see prepareDmText).
      const checked = await prepareDmText(text).catch((e: any) => {
        if (e?.code === 'suspended') return { suspended: String(e.message) } as const
        throw e
      })
      if ('suspended' in checked) { toastError(checked.suspended || 'Your account is suspended.'); return }
      if (checked.blocked) { toastError(t('links.cant_share')); return }
      if (!sharedKeyRef.current && privateKeyRef.current) await connectPeer().catch(() => false)
      const wire = sharedKeyRef.current ? await encryptMessage(checked.text, sharedKeyRef.current) : checked.text
      const res = await editMessageAction(target.id, wire)
      if (!('success' in res) || !res.success) {
        const code = (res as { code?: string }).code
        if (code === 'blocked_by_me' || code === 'not_mutual') { setLock(code); toastError(CHAT_LOCK_COPY[code]); cancelEdit(); return }
        toastError(t('chat.could_not_edit'))
        return                                               // stay in edit mode: nothing is lost, they can retry
      }
      if (isEncrypted(wire)) plainTextCache.set(wire, checked.text)
      setMessages(prev => applyRowUpdate(prev, { id: target.id, body: wire, edited_at: res.editedAt }))
      if (res.preview) patchChatListCache(currentUserId, conversationId, { last_message_preview: res.preview })
      cancelEdit()
    } catch (e) {
      console.warn('[chat] edit failed:', e)
      toastError(t('chat.could_not_edit'))
    } finally {
      setEditSaving(false)
    }
  }

  function openMedia(m: Message) {
    if (m.media_url && !m._optimistic) setLightbox({ url: m.media_url, type: m.media_type === 'video' ? 'video' : 'image', msg: m })
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
      if (msg.is_deleted) continue          // deleted messages are not drawn at all - no "message deleted" trail
      const k = dayKey(msg.created_at)
      if (!prev || dayKey(prev.created_at) !== k) rows.push({ type: 'day', key: `day-${k}`, label: dayLabel(msg.created_at) })
      const grouped = !!prev && dayKey(prev.created_at) === k && prev.sender_id === msg.sender_id &&
        Math.abs(new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 60_000
      rows.push({ type: 'msg', key: msg._key ?? msg.id, msg, grouped })
      prev = msg
    }
  }

  // Swipe right = reply, long press = options (touch). See hooks/use-message-gestures.ts.
  const gestures = useMessageGestures({
    onLongPress: id => setMenu({ id, keyboard: false }),
    onSwipeReply: id => {
      const m = messagesRef.current.find(x => x.id === id)
      if (!m || m.is_deleted || m._optimistic || !canSend) return
      if (editing) cancelEdit()
      setReplyTo(m)
      inputRef.current?.focus()
    },
  })

  // The options for the open menu's message. A message that disappears (deleted on the other side) closes it.
  const menuMsg = menu ? (messages.find(m => m.id === menu.id && !m.is_deleted && !m._optimistic) ?? null) : null
  useEffect(() => { if (menu && !menuMsg) setMenu(null) }, [menu, menuMsg])

  function menuItemsFor(m: Message): MenuItem[] {
    const mine = m.sender_id === currentUserId
    const mText = textOf(m)
    const readable = typeof mText === 'string' && mText !== '' && mText !== UNDECRYPTABLE
    const items: MenuItem[] = []
    if (canSend) {
      items.push({
        key: 'reply', label: t('chat.reply'), icon: <CornerUpLeft size={18} />,
        onSelect: () => { if (editing) cancelEdit(); setReplyTo(m); inputRef.current?.focus() },
      })
    }
    if (m.media_url) items.push({ key: 'view', label: t('chat.view'), icon: <Eye size={18} />, onSelect: () => openMedia(m) })
    if (readable) items.push({ key: 'copy', label: t('chat.copy'), icon: <Copy size={18} />, onSelect: () => { void handleCopy(m) } })
    if (mine && canSend && !attachment && !attachUploading && readable) {
      items.push({ key: 'edit', label: t('chat.edit'), icon: <Pencil size={18} />, onSelect: () => startEdit(m) })
    }
    if (mine) {
      items.push(confirmDeleteId === m.id
        ? { key: 'delete', label: t('chat.delete_confirm'), icon: <Trash2 size={18} />, danger: true, confirm: true, onSelect: () => { void handleDelete(m.id) } }
        : { key: 'delete', label: t('chat.delete'), icon: <Trash2 size={18} />, danger: true, keepOpen: true, onSelect: () => setConfirmDeleteId(m.id) })
    }
    return items
  }

  const visibleCount = messages.reduce((n, m) => n + (m.is_deleted ? 0 : 1), 0)

  // Hold back the first paint of the messages until the cached ones are decrypted (normally a few ms), so a
  // bubble never flashes "…" and then changes. Never longer than PAINT_HOLD_MAX_MS, and only for the first paint.
  const pendingDecrypt = messages.some(m => !m.is_deleted && !m._optimistic && !!m.body && isEncrypted(m.body) && plainTextCache.get(m.body) === undefined)
  const holdPaint = !paintOpen && (cryptoState === 'loading' || (cryptoState === 'ready' && pendingDecrypt))
  useEffect(() => { if (!paintOpen && loaded && !holdPaint) setPaintOpen(true) }, [paintOpen, loaded, holdPaint])
  useEffect(() => {
    const id = setTimeout(() => setPaintOpen(true), PAINT_HOLD_MAX_MS)
    return () => clearTimeout(id)
  }, [])

  // Only ever states something that is true and useful. Encryption problems
  // (no key yet, unavailable) are handled silently: nothing is shown for them.
  const subtitle: { text: string; lock: boolean; typing?: boolean } = peerTyping && online
    ? { text: t('chat.typing'), lock: false, typing: true }
    : !online
      ? { text: 'Waiting for network…', lock: false }
      : realtime === 'down' && loaded
        ? { text: 'Reconnecting…', lock: false }
        : cryptoState === 'ready'
          ? { text: t('chat.end_to_end_encrypted'), lock: true }
          : { text: '', lock: false }

  const attachLocked = attachUploading || !!attachment || !!editing
  const sendReady = (!!body.trim() || (!!attachment && !editing)) && !attachUploading && !editSaving

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
              <div data-testid="chat-subtitle" style={{ fontSize: 11, color: subtitle.typing ? 'var(--color-brand)' : 'var(--color-text-muted)', fontWeight: subtitle.typing ? 600 : 400, display: 'flex', alignItems: 'center', gap: 4 }}>
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
          style={{ flex: 1, minHeight: 0, overflowY: menu ? 'hidden' : 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '12px 16px' }}
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
            {loadError && visibleCount === 0 && (
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
            {loadError && visibleCount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 8px' }}>
                <button onClick={e => { e.stopPropagation(); void syncLatest() }} style={{ ...pillBtn, color: 'var(--color-error)' }}>
                  <RefreshCw size={12} /> Couldn&apos;t refresh · Tap to retry
                </button>
              </div>
            )}

            {!loadError && visibleCount === 0 && !loaded && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '56px 0' }}>
                <Loader2 size={22} color="var(--color-brand)" style={{ animation: 'chat-spin 0.8s linear infinite' }} />
              </div>
            )}

            {!loadError && visibleCount === 0 && loaded && (
              <div data-testid="chat-empty" style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--color-text-secondary)', fontSize: 14 }}>
                No messages yet. Say hi 👋
              </div>
            )}

            <div style={{ visibility: holdPaint ? 'hidden' : 'visible' }}>
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
                  className="chat-msg-wrap"
                  // Touch: swipe right = reply, long press = options. (Mouse: click / right-click / hover button.)
                  {...(canAct ? gestures.bind(msg.id, { longPress: true, swipe: canSend }) : {})}
                  onContextMenu={e => {
                    if (!canAct) return
                    e.preventDefault()   // no native menu (long-press on a photo, right-click)
                    if (gestures.lastPointerType() === 'mouse') setMenu({ id: msg.id, keyboard: false })
                  }}
                  style={{ position: 'relative', marginBottom: grouped ? 2 : 10, borderRadius: 12, touchAction: 'pan-y' }}
                >
                  {canAct && canSend && (
                    <div data-swipe-icon aria-hidden style={{
                      position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%) scale(0.6)', opacity: 0,
                      width: 32, height: 32, borderRadius: '50%', background: 'var(--color-surface-2)',
                      color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      pointerEvents: 'none',
                    }}>
                      <CornerUpLeft size={16} />
                    </div>
                  )}
                  <div data-swipe-row style={{ display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8 }}>
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
                    {/* Bubble. Mouse click opens the options (a touch tap does nothing on text: long-press is the menu). */}
                    <div
                      data-bubble-id={msg.id}
                      role={canAct ? 'button' : undefined}
                      tabIndex={canAct ? 0 : undefined}
                      aria-label={canAct ? t('chat.message_options') : undefined}
                      onClick={e => {
                        e.stopPropagation()
                        if (gestures.wasGesture()) { e.preventDefault(); return }   // the tail of a long press / swipe, not a tap
                        if (!canAct || gestures.lastPointerType() !== 'mouse') return
                        if (window.getSelection()?.toString()) return                // they were selecting text, not clicking
                        setMenu({ id: msg.id, keyboard: false })
                      }}
                      onKeyDown={e => { if (canAct && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setMenu({ id: msg.id, keyboard: true }) } }}
                      style={{
                        // The message the menu belongs to sits above the dim (z-index 40 in message-actions-popup).
                        position: selected ? 'relative' : undefined, zIndex: selected ? 41 : undefined,
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
                        outline: msg._failed ? '1px solid var(--color-border)' : 'none',
                        outlineOffset: -1,
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
                          onClick={e => {
                            e.stopPropagation()
                            if (gestures.wasGesture()) { e.preventDefault(); return }   // long press / swipe tail
                            if (canAct) openMedia(msg)                                  // one tap: the full-screen viewer (it has the reply box)
                          }}
                          style={{
                            position: 'relative', borderRadius: 12, overflow: 'hidden',
                            marginBottom: hasCaption ? 6 : 0, cursor: 'pointer', background: 'rgba(0,0,0,0.15)',
                            aspectRatio: msg.media_width && msg.media_height ? `${msg.media_width} / ${msg.media_height}` : '4 / 3',
                          }}
                        >
                          {msg.media_type === 'video' ? (
                            <>
                              {msg.media_thumbnail_url
                                ? <img src={msg.media_thumbnail_url} alt={t('chat.video_attachment_alt')} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
                            <img src={msg.media_url ?? undefined} alt={t('chat.photo_attachment_alt')} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          )}
                        </div>
                      )}

                      {msg.is_deleted
                        ? <em style={{ opacity: 0.6, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Trash2 size={12} /> {t('chat.message_deleted')}</em>
                        : failedDecrypt
                          ? <em style={{ opacity: 0.7, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Lock size={12} /> {t('chat.cant_open_on_device')}</em>
                          : hasMedia
                            ? (hasCaption ? <span style={{ padding: '0 7px 3px' }}>{linkifyShortLinks(text)}</span> : null)
                            : text === undefined
                              ? <em style={{ opacity: 0.6, fontSize: 13 }}>{placeholder()}</em>
                              : linkifyShortLinks(text)}
                    </div>

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
                          {msg.edited_at ? `${t('chat.edited')} · ` : ''}{new Date(msg.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {status && status !== 'failed' && <MessageStatusIcon status={status} />}
                    </div>
                  </div>

                  {/* Desktop: a small button appears beside the bubble on hover (hidden on touch screens). */}
                  {canAct && (
                    <button
                      type="button"
                      className="chat-msg-opt"
                      aria-label={t('chat.message_options')}
                      onClick={e => { e.stopPropagation(); setMenu({ id: msg.id, keyboard: false }) }}
                      style={{
                        alignSelf: 'center', flexShrink: 0, width: 24, height: 24, borderRadius: '50%', border: 'none',
                        background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <ChevronDown size={14} />
                    </button>
                  )}
                  </div>
                </div>
              )
            })}
            </div>

            {/* The other person is typing */}
            {peerTyping && online && (
              <div data-testid="chat-typing" role="status" aria-label={t('chat.typing')} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 28, flexShrink: 0 }}>
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
                </div>
                <div style={{ background: 'var(--color-surface-2)', borderRadius: '4px 18px 18px 18px', padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-secondary)',
                      animation: `chat-typing-dot 1.2s ${i * 0.18}s infinite ease-in-out`,
                    }} />
                  ))}
                </div>
              </div>
            )}
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

      {/* Edit banner */}
      {editing && (
        <div style={{
          padding: '8px 16px', background: 'var(--color-surface-2)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <Pencil size={16} color="var(--color-brand)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, borderLeft: '3px solid var(--color-brand)', paddingLeft: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--color-brand)', fontWeight: 600, marginBottom: 2 }}>
              {t('chat.editing_message')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {textOf(editing) ?? ''}
            </div>
          </div>
          <button aria-label={t('chat.cancel_edit')} onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Reply banner */}
      {replyTo && !editing && (
        <div style={{
          padding: '8px 16px', background: 'var(--color-surface-2)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          {(replyTo.media_type === 'video' ? replyTo.media_thumbnail_url : replyTo.media_url) && (
            <img
              src={(replyTo.media_type === 'video' ? replyTo.media_thumbnail_url : replyTo.media_url) ?? undefined}
              alt="" aria-hidden
              style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
            />
          )}
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
            disabled={attachLocked}
            style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: attachLocked ? 'default' : 'pointer',
              opacity: attachLocked ? 0.5 : 1,
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
              // "typing…" for the other person - not while editing an old message, and it ends when the box is emptied.
              if (!editing) { if (e.target.value.trim()) typingRef.current?.input(); else typingRef.current?.stop() }
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
            aria-label={editing ? t('chat.save_edit') : t('chat.send_message')}
            onMouseDown={e => e.preventDefault()}   // keep the keyboard open on the phone
            onClick={handleSend}
            disabled={!sendReady}
            style={{
              width: 42, height: 42, borderRadius: '50%',
              background: sendReady ? 'var(--color-brand)' : 'var(--color-surface-2)',
              border: 'none', cursor: sendReady ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 0.2s',
            }}
          >
            {editSaving
              ? <Loader2 size={17} color="var(--color-text-muted)" style={{ animation: 'chat-spin 0.8s linear infinite' }} />
              : editing
                ? <Check size={18} color={sendReady ? 'white' : 'var(--color-text-muted)'} />
                : <Send size={17} color={sendReady ? 'white' : 'var(--color-text-muted)'} />}
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

      {/* Options for the pressed message: anchored popup over a dimmed chat */}
      {menu && menuMsg && (
        <MessageActionsPopup
          anchorId={menuMsg.id}
          mine={menuMsg.sender_id === currentUserId}
          items={menuItemsFor(menuMsg)}
          focusFirst={menu.keyboard}
          onClose={() => setMenu(null)}
        />
      )}

      {/* Media viewer: its own full-screen portal, with Share/Save and a reply field */}
      {lightbox && (
        <ChatMediaViewer
          url={lightbox.url}
          type={lightbox.type}
          senderName={lightbox.msg.sender_id === currentUserId ? undefined : otherUser.display_name}
          canReply={canSend}
          onReply={text => sendReplyFromViewer(lightbox.msg, text)}
          onClose={() => setLightbox(null)}
        />
      )}

      <style>{`
        @keyframes chat-spin { to { transform: rotate(360deg); } }
        .chat-msg-wrap { -webkit-touch-callout: none; }
        @media (pointer: coarse) { .chat-msg-wrap { -webkit-user-select: none; user-select: none; } }
        .chat-msg-opt { opacity: 0; transition: opacity 0.12s; }
        .chat-msg-wrap:hover .chat-msg-opt, .chat-msg-opt:focus-visible { opacity: 1; }
        @media (hover: none) { .chat-msg-opt { display: none; } }
        @keyframes chat-typing-dot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }
      `}</style>
    </div>
  )
}