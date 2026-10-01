'use client'

// src/app/(main)/messages/messages-list-client.tsx
// Wraps the conversation list with realtime updates + unread badge refresh.

import { useState, useEffect, useRef } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { getConversationsAction, markAllDeliveredAction, getPublicKeyAction, unhideConversationAction } from '@/lib/actions/messages'
import { notifyChatUnreadChanged } from '@/hooks/use-chat-unread'
import { formatRelativeTime } from '@/lib/utils'
import { Trash2, Image as ImageIcon, Video, ChevronDown, ChevronRight } from 'lucide-react'
import {
  getStoredKeyPair, deriveSharedKey, decryptMessage, isEncrypted, UNDECRYPTABLE,
  getCachedPeerPublicKey, setCachedPeerPublicKey,
} from '@/lib/chat-crypto'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/language-context'

const AVATAR_COLORS = ['#1A9E5F','#7A3A1A','#1A4A7A','#4A1A7A','#7A6A1A']

interface Conversation {
  id: string
  other: { id: string; username: string; display_name: string; avatar_url: string | null; verification_tier: string } | null
  last_message_preview: string | null
  last_message_at: string | null
  unread_count: number
  /** Why the thread is read-only (blocked / no longer mutual). null = normal. */
  lock: 'blocked_by_me' | 'not_mutual' | null
  /** Hidden by me (the other person's copy is untouched). */
  hidden: boolean
}

interface Props {
  initialConversations: Conversation[]
  currentUserId: string
}

export default function MessagesListClient({ initialConversations, currentUserId }: Props) {
  const { t } = useTranslation()
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations)
  const supabase = useRef<ReturnType<typeof createBrowserClient> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = useRef(false)
  const [showInactive, setShowInactive] = useState(false)
  const [showHidden, setShowHidden] = useState(false)

  // ── Decrypt previews ────────────────────────────────────────────────────────
  // last_message_preview may now hold ciphertext (see sendMessageAction) instead
  // of a fixed '[Encrypted message]' placeholder. Decrypt it locally with the
  // same ECDH shared key used inside a conversation - no PIN prompt here even
  // if that fails: this is a best-effort preview, not a gate to the content
  // (the full conversation still opens and can prompt for the PIN if needed).
  // Keyed by the ciphertext itself (unique per message - AES-GCM uses a fresh
  // random IV every time), not by conversation id, so a new incoming message
  // is always re-decrypted instead of the list getting stuck showing whichever
  // message happened to decrypt first.
  const [decrypted, setDecrypted] = useState<Record<string, string>>({})
  const sharedKeyCache = useRef(new Map<string, CryptoKey | null>()) // otherUserId -> derived key (or null = no key available)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const keyPair = await getStoredKeyPair(currentUserId)
      if (!keyPair || cancelled) return // no local key cached yet on this device - leave previews as the generic label

      async function decryptWith(cipher: string, key: CryptoKey) {
        const plain = await decryptMessage(cipher, key)
        if (!cancelled && plain !== UNDECRYPTABLE) setDecrypted(prev => ({ ...prev, [cipher]: plain }))
      }

      for (const conv of conversations) {
        if (cancelled) return
        const cipher = conv.last_message_preview
        const peerId = conv.other?.id
        if (!peerId || !isEncrypted(cipher)) continue
        if (decrypted[cipher!] !== undefined) continue // already decrypted this exact ciphertext

        const cachedKey = sharedKeyCache.current.get(peerId)
        if (cachedKey) {
          // Fast path: decrypt immediately with whatever key we derived last
          // time, no network wait - this is what makes the preview appear
          // right away on a returning visit instead of showing the generic
          // "Message" label for a beat first.
          void decryptWith(cipher!, cachedKey)
        } else {
          const cachedPub = getCachedPeerPublicKey(currentUserId, peerId)
          if (cachedPub) {
            try {
              const key = await deriveSharedKey(keyPair.privateKey, cachedPub)
              sharedKeyCache.current.set(peerId, key)
              void decryptWith(cipher!, key)
            } catch { /* fall through to the server fetch below */ }
          }
        }

        // Verify/refresh against the server in the background - reconciles a
        // rotated key without blocking every other row's decryption on it.
        ;(async () => {
          try {
            const { publicKey } = await getPublicKeyAction(peerId)
            if (!publicKey || cancelled) return
            setCachedPeerPublicKey(currentUserId, peerId, publicKey)
            const key = await deriveSharedKey(keyPair.privateKey, publicKey)
            sharedKeyCache.current.set(peerId, key)
            if (!cancelled) void decryptWith(cipher!, key)
          } catch { /* best-effort preview - the thread itself still opens fine */ }
        })()
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, currentUserId])


  // ── Realtime: refresh list when any message arrives ────────────────────────
  useEffect(() => {
    const sb = (supabase.current ??= createBrowserClient())

    // Bursts of events (a message INSERT plus the conversation UPDATE that
    // follows it) collapse into one refresh.
    async function refresh() {
      if (busy.current) return
      busy.current = true
      try {
        const fresh = await getConversationsAction()
        setConversations(fresh as Conversation[])
        notifyChatUnreadChanged()          // keep the Chat tab badge in step with this list
      } catch (e) {
        console.error('[chat list] refresh failed:', e)
      } finally {
        busy.current = false
      }
    }
    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        void refresh()
        // This device now has whatever was sent to me: that's "delivered".
        void markAllDeliveredAction()
      }, 250)
    }

    // The list is on screen, so anything already sent to me counts as delivered
    // (done here, in the browser, not while the server renders the page).
    void markAllDeliveredAction()

    const channel = sb
      .channel(`conversations-list:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, scheduleRefresh)
      .subscribe()

    // Safety net: keeps the list right even if realtime isn't delivering, and
    // catches up after the phone slept.
    const wake = () => { if (document.visibilityState === 'visible') scheduleRefresh() }
    const poll = setInterval(wake, 30_000)
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)

    return () => {
      if (timer.current) clearTimeout(timer.current)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      void sb.removeChannel(channel)
    }
  }, [currentUserId])

  if (conversations.length === 0) return null

  async function handleUnhide(id: string) {
    setConversations(prev => prev.map(c => (c.id === id ? { ...c, hidden: false } : c)))   // optimistic
    const r = await unhideConversationAction(id).catch(() => ({ error: 'network' }))
    if ('error' in r) setConversations(prev => prev.map(c => (c.id === id ? { ...c, hidden: true } : c)))
  }

  const renderRow = (conv: Conversation, hiddenRow = false) => {
    {
        const other    = conv.other
        const initials = other?.display_name?.slice(0, 2).toUpperCase() ?? '??'
        const color    = AVATAR_COLORS[(other?.username?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
        // Encryption is an implementation detail - it's only ever surfaced inside
        // an open conversation (the "End-to-end encrypted" line under the other
        // person's name). The list never mentions it: an undecrypted preview
        // just falls back to a plain, generic label instead.
        const preview  = isEncrypted(conv.last_message_preview) && decrypted[conv.last_message_preview!] !== undefined
          ? decrypted[conv.last_message_preview!]
          : isEncrypted(conv.last_message_preview) || conv.last_message_preview === '[Encrypted message]'
            ? t('chat.message_label') // isEncrypted: new rows we can't decrypt (yet); the literal string: rows written before this fix
            : conv.last_message_preview === 'Message deleted'
              ? t('chat.message_deleted')
              : (conv.last_message_preview ?? t('chat.no_messages_yet'))

        return (
          <Link key={conv.id} href={`/messages/${conv.id}`} style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 20px',
              borderBottom: '1px solid var(--color-border)',
              transition: 'background 0.1s',
              background: conv.unread_count > 0 ? 'var(--color-surface-2)' : 'transparent',
            }}>
              {/* Avatar */}
              <div style={{
                width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                background: other?.avatar_url ? 'transparent' : color,
                overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: 'white',
              }}>
                {other?.avatar_url
                  ? <img src={other.avatar_url} alt={other.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials
                }
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{
                    fontSize: 15, fontWeight: conv.unread_count > 0 ? 700 : 500,
                    color: 'var(--color-text-primary)',
                    fontFamily: "'Syne', sans-serif",
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {other?.display_name}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flexShrink: 0, marginLeft: 8 }}>
                    {conv.last_message_at ? formatRelativeTime(conv.last_message_at) : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 13,
                    color: conv.unread_count > 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontWeight: conv.unread_count > 0 ? 600 : 400,
                  }}>
                    {conv.last_message_preview === 'Message deleted' && <Trash2 size={12} style={{ flexShrink: 0, opacity: 0.7 }} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</span>
                  </span>
                  {hiddenRow && (
                    <button
                      onClick={e => { e.preventDefault(); e.stopPropagation(); void handleUnhide(conv.id) }}
                      style={{ flexShrink: 0, marginLeft: 8, background: 'none', border: '1px solid var(--color-border)', borderRadius: 14, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                    >
                      Unhide
                    </button>
                  )}
                  {conv.unread_count > 0 && (
                    <div style={{
                      minWidth: 20, height: 20, borderRadius: 10,
                      background: 'var(--color-brand)', color: 'white',
                      fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 5px', flexShrink: 0, marginLeft: 8,
                    }}>
                      {conv.unread_count > 99 ? '99+' : conv.unread_count}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Link>
        )
    }
  }

  const visible  = conversations.filter(c => !c.hidden)
  const active   = visible.filter(c => !c.lock)
  const inactive = visible.filter(c => c.lock)
  const hidden   = conversations.filter(c => c.hidden)
  const unreadIn = (list: Conversation[]) => list.reduce((n, c) => n + (c.unread_count > 0 ? 1 : 0), 0)

  const sectionHeader = (label: string, count: number, open: boolean, toggle: () => void, unread: number) => (
    <button
      onClick={toggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '12px 20px',
        background: 'var(--color-surface-2)', border: 'none', borderBottom: '1px solid var(--color-border)',
        cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)',
        fontFamily: "'Syne', sans-serif", textAlign: 'left',
      }}
    >
      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      {label} ({count})
      {!open && unread > 0 && <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--color-brand)' }} />}
    </button>
  )

  return (
    <div>
      {active.map(c => renderRow(c))}

      {inactive.length > 0 && (
        <>
          {sectionHeader('Inactive chats', inactive.length, showInactive, () => setShowInactive(v => !v), unreadIn(inactive))}
          {showInactive && (
            <>
              <p style={{ margin: 0, padding: '10px 20px', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                You can read these, but not reply until you follow each other again.
              </p>
              {inactive.map(c => renderRow(c))}
            </>
          )}
        </>
      )}

      {hidden.length > 0 && (
        <>
          {sectionHeader('Hidden chats', hidden.length, showHidden, () => setShowHidden(v => !v), 0)}
          {showHidden && hidden.map(c => renderRow(c, true))}
        </>
      )}
    </div>
  )
}