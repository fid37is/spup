'use client'

// src/app/(main)/messages/messages-list-client.tsx
//
// The Chat screen: header + conversation list.
//
// It paints from the on-device cache straight away (see lib/chat-list-cache.ts)
// and refreshes in the background, so opening Chat never waits on the server
// first - same feel as WhatsApp. The server page no longer fetches the list.

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase/client'
import { getConversationsAction, markAllDeliveredAction, getPublicKeyAction, unhideConversationAction, markAllConversationsReadAction } from '@/lib/actions/messages'
import { notifyChatUnreadChanged } from '@/hooks/use-chat-unread'
import { Check, ChevronDown, ChevronRight, MessageSquare, Plus, MessageCircle, MessageSquareDot, User, Settings, CheckCheck, Search, X } from 'lucide-react'
import {
  getStoredKeyPair, deriveSharedKey, decryptMessage, isEncrypted, UNDECRYPTABLE,
  getCachedPeerPublicKey, setCachedPeerPublicKey,
} from '@/lib/chat-crypto'
import {
  decryptedPreviews, sharedPreviewKeys, peekChatListMemory, readChatListCache, writeChatListCache, patchChatListCache,
  sortConversations, hasMessage, type ChatListConversation,
} from '@/lib/chat-list-cache'
import ConversationRow from '@/components/chat/conversation-row'
import HideMobileHeader from '@/components/layout/hide-mobile-header'
import { useTranslation } from '@/lib/i18n/language-context'

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

interface Props {
  currentUserId: string
}

export type ChatFilter = 'all' | 'unread' | 'direct'

const FILTER_LABEL: Record<ChatFilter, string> = { all: 'All', unread: 'Unread', direct: 'Direct' }

interface HeaderProps {
  /** Omit on the loading screen: the filter only shows on the live list. */
  filter?: ChatFilter
  onFilterChange?: (f: ChatFilter) => void
  onMarkAllRead?: () => void
  canMarkAllRead?: boolean
  /** Search box under the title row. Without onSearchChange it is drawn inert (loading screen). */
  search?: string
  onSearchChange?: (q: string) => void
}

function FilterMenu({ filter, onFilterChange, onMarkAllRead, canMarkAllRead }: Required<Pick<HeaderProps, 'filter' | 'onFilterChange' | 'onMarkAllRead' | 'canMarkAllRead'>>) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const item: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 16px',
    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
    color: 'var(--color-text-primary)', fontSize: 15, fontWeight: 500, textDecoration: 'none',
    fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box',
  }
  const divider = <div style={{ height: 6, background: 'var(--color-surface-2)' }} />
  const choose = (f: ChatFilter) => { onFilterChange(f); setOpen(false) }
  const filterRow = (f: ChatFilter, icon: React.ReactNode) => (
    <button key={f} role="menuitemradio" aria-checked={filter === f} onClick={() => choose(f)} style={item}>
      {icon}
      <span style={{ flex: 1 }}>{FILTER_LABEL[f]}</span>
      {filter === f && <Check size={18} />}
    </button>
  )

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu" aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'none',
          border: '1px solid var(--color-border)', borderRadius: 20, padding: '7px 14px',
          color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          fontFamily: "'Syne', sans-serif",
        }}
      >
        {FILTER_LABEL[filter]}
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div role="menu" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 30, width: 240,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14,
          boxShadow: '0 8px 30px rgba(0,0,0,0.35)', overflow: 'hidden',
        }}>
          {filterRow('all', <MessageCircle size={20} />)}
          {filterRow('unread', <MessageSquareDot size={20} />)}
          {filterRow('direct', <User size={20} />)}
          {divider}
          <Link href="/messages/settings" role="menuitem" onClick={() => setOpen(false)} style={item}>
            <Settings size={20} /> Settings
          </Link>
          {divider}
          <button role="menuitem" disabled={!canMarkAllRead}
            onClick={() => { onMarkAllRead(); setOpen(false) }}
            style={{ ...item, opacity: canMarkAllRead ? 1 : 0.45, cursor: canMarkAllRead ? 'pointer' : 'default' }}>
            <CheckCheck size={20} /> Mark all as read
          </button>
        </div>
      )}
    </div>
  )
}

export function ChatListHeader({ filter, onFilterChange, onMarkAllRead, canMarkAllRead, search = '', onSearchChange }: HeaderProps = {}) {
  const { t } = useTranslation()
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 10,
      backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
      borderBottom: '1px solid var(--color-border)',
      // The app's own top bar is hidden on this screen (HideMobileHeader), so clear the status bar here.
      padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 20px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--color-text-primary)', margin: 0 }}>
          {t('chat.title')}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {filter && onFilterChange && onMarkAllRead && (
            <FilterMenu filter={filter} onFilterChange={onFilterChange} onMarkAllRead={onMarkAllRead} canMarkAllRead={!!canMarkAllRead} />
          )}
          <Link href="/messages/new" aria-label={t('chat.new_chat')} title={t('chat.new_chat')} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: '50%',
            background: 'var(--color-brand)', color: 'white', textDecoration: 'none',
          }}>
            <Plus size={18} strokeWidth={2.4} />
          </Link>
        </div>
      </div>

      <div style={{
        marginTop: 10, display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
        borderRadius: 22, padding: '0 12px', height: 38,
      }}>
        <Search size={16} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
        <input
          type="text" inputMode="search" enterKeyHint="search"
          value={search}
          onChange={e => onSearchChange?.(e.target.value)}
          readOnly={!onSearchChange}
          placeholder="Search chats"
          aria-label="Search chats"
          autoComplete="off" autoCorrect="off" spellCheck={false}
          style={{
            flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none',
            color: 'var(--color-text-primary)', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
          }}
        />
        {search && onSearchChange && (
          <button type="button" onClick={() => onSearchChange('')} aria-label="Clear search" style={{
            background: 'none', border: 'none', padding: 2, display: 'flex', cursor: 'pointer', color: 'var(--color-text-muted)',
          }}>
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div aria-hidden>
      <style>{`
        @keyframes msgs-sk-shimmer { 0% { opacity: 1; } 50% { opacity: 0.45; } 100% { opacity: 1; } }
        .msgs-sk { animation: msgs-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="msgs-sk" style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="msgs-sk" style={{ height: 15, width: 140, marginBottom: 8 }} />
            <div className="msgs-sk" style={{ height: 13, width: '70%' }} />
          </div>
          <div className="msgs-sk" style={{ height: 11, width: 34, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ filter }: { filter: ChatFilter }) {
  const { t } = useTranslation()
  if (filter === 'unread') {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14 }}>
        You&apos;re all caught up - no unread chats.
      </div>
    )
  }
  return (
    <div style={{ padding: '80px 20px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <MessageSquare size={28} color="var(--color-text-secondary)" />
      </div>
      <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 8 }}>
        {t('chat.no_chats_yet')}
      </h3>
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
        {t('chat.start_conversation_hint')}
      </p>
      <Link href="/messages/new" style={{
        background: 'var(--color-brand)', color: 'white',
        borderRadius: 20, padding: '11px 24px',
        textDecoration: 'none', fontSize: 14,
        fontFamily: "'Syne', sans-serif", fontWeight: 700,
      }}>
        {t('chat.start_a_chat')}
      </Link>
    </div>
  )
}

export default function MessagesListClient({ currentUserId }: Props) {
  // null = nothing known yet (first ever visit on this device): show the skeleton.
  // Otherwise the last-known list is on screen immediately.
  const [conversations, setConversations] = useState<ChatListConversation[] | null>(() => peekChatListMemory(currentUserId))
  const supabase = useRef<ReturnType<typeof createBrowserClient> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = useRef(false)
  const [filter, setFilter] = useState<ChatFilter>('all')
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [, bumpPreviews] = useState(0)

  // Cold start (app reopened): nothing in memory yet, but the device has the last list.
  useIsoLayoutEffect(() => {
    setConversations(cur => cur ?? readChatListCache(currentUserId))
  }, [currentUserId])

  function applyFresh(raw: ChatListConversation[]) {
    // Chats with nothing in them never appear; newest activity first.
    const next = sortConversations(raw.filter(hasMessage))
    setConversations(next)
    writeChatListCache(currentUserId, next)
  }

  // ── Decrypt previews ────────────────────────────────────────────────────────
  // last_message_preview holds ciphertext (see sendMessageAction). Decrypt it
  // locally with the same ECDH shared key used inside a conversation - no PIN
  // prompt here even if that fails: this is a best-effort preview, not a gate to
  // the content. Results are kept in memory (lib/chat-list-cache.ts), keyed by
  // the ciphertext itself (unique per message), so coming back to this screen
  // shows them instantly instead of re-decrypting every row.
  useEffect(() => {
    if (!conversations) return
    let cancelled = false
      ; (async () => {
        const keyPair = await getStoredKeyPair(currentUserId)
        if (!keyPair || cancelled) return // no local key cached yet on this device - leave previews as the generic label

        async function decryptWith(cipher: string, key: CryptoKey) {
          const plain = await decryptMessage(cipher, key)
          if (!cancelled && plain !== UNDECRYPTABLE && decryptedPreviews.get(cipher) !== plain) {
            decryptedPreviews.set(cipher, plain)
            bumpPreviews(n => n + 1)
          }
        }

        for (const conv of conversations) {
          if (cancelled) return
          const cipher = conv.last_message_preview
          const peerId = conv.other?.id
          if (!peerId || !isEncrypted(cipher)) continue
          if (decryptedPreviews.has(cipher!)) continue // already decrypted this exact ciphertext

          const keyId = `${currentUserId}:${peerId}`
          const cachedKey = sharedPreviewKeys.get(keyId)
          if (cachedKey) {
            void decryptWith(cipher!, cachedKey)
          } else {
            const cachedPub = getCachedPeerPublicKey(currentUserId, peerId)
            if (cachedPub) {
              try {
                const key = await deriveSharedKey(keyPair.privateKey, cachedPub)
                sharedPreviewKeys.set(keyId, key)
                void decryptWith(cipher!, key)
              } catch { /* fall through to the server fetch below */ }
            }
          }

          // Verify/refresh against the server in the background - reconciles a
          // rotated key without blocking every other row's decryption on it.
          // Skipped once this peer's key has been confirmed this session.
          if (sharedPreviewKeys.get(`${keyId}:confirmed`) !== undefined) continue
            ; (async () => {
              try {
                const { publicKey } = await getPublicKeyAction(peerId)
                if (!publicKey || cancelled) return
                setCachedPeerPublicKey(currentUserId, peerId, publicKey)
                const key = await deriveSharedKey(keyPair.privateKey, publicKey)
                sharedPreviewKeys.set(keyId, key)
                sharedPreviewKeys.set(`${keyId}:confirmed`, null)
                if (!cancelled) void decryptWith(cipher!, key)
              } catch { /* best-effort preview - the thread itself still opens fine */ }
            })()
        }
      })()
    return () => { cancelled = true }
  }, [conversations, currentUserId])

  // ── Load + realtime ─────────────────────────────────────────────────────────
  useEffect(() => {
    const sb = (supabase.current ??= createBrowserClient())

    // Bursts of events (a message INSERT plus the conversation UPDATE that
    // follows it, or a run of read-receipt UPDATEs) collapse into one refresh.
    async function refresh() {
      if (busy.current) return
      busy.current = true
      try {
        const fresh = await getConversationsAction()
        applyFresh(fresh as ChatListConversation[])
        notifyChatUnreadChanged()          // keep the Chat tab badge in step with this list
      } catch (e) {
        console.error('[chat list] refresh failed:', e)
        setConversations(cur => cur ?? [])   // offline with nothing cached: show the empty state, not a spinner forever
      } finally {
        busy.current = false
      }
    }
    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        void refresh().then(() => markAllDeliveredAction())   // list first; this device now has whatever was sent to me: "delivered"
      }, 250)
    }

    // Fetch straight away (the cached list is already on screen), then mark delivered.
    void refresh().then(() => markAllDeliveredAction())

    const channel = sb
      .channel(`conversations-list:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, scheduleRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, scheduleRefresh)
      // Read / delivered receipts: lets the tick next to my last message turn green live.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, scheduleRefresh)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId])

  async function handleMarkAllRead() {
    const before = conversations
    if (!before) return
    // Optimistic: clear the badges now, put them back if the server says no.
    const cleared = before.map(c => ({ ...c, unread_count: 0 }))
    setConversations(cleared)
    writeChatListCache(currentUserId, cleared)
    notifyChatUnreadChanged()
    const r = await markAllConversationsReadAction().catch(() => ({ error: 'network' }))
    if ('error' in r) { setConversations(before); writeChatListCache(currentUserId, before) }
    notifyChatUnreadChanged()
  }

  async function handleUnhide(id: string) {
    setConversations(prev => prev && prev.map(c => (c.id === id ? { ...c, hidden: false } : c)))   // optimistic
    const r = await unhideConversationAction(id).catch(() => ({ error: 'network' }))
    if ('error' in r) setConversations(prev => prev && prev.map(c => (c.id === id ? { ...c, hidden: true } : c)))
  }

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

  // Search narrows whatever the filter shows: matches the person's name or @username, and the
  // message preview once it has been decrypted on this device (ciphertext is never searched).
  const q = search.trim().toLowerCase()
  const shown = conversations && q
    ? conversations.filter(c => {
      const cipher = c.last_message_preview
      const preview = cipher ? (decryptedPreviews.get(cipher) ?? (isEncrypted(cipher) ? '' : cipher)) : ''
      return (
        (c.other?.display_name ?? '').toLowerCase().includes(q) ||
        (c.other?.username ?? '').toLowerCase().includes(q) ||
        preview.toLowerCase().includes(q)
      )
    })
    : conversations

  let body: React.ReactNode
  if (shown === null) {
    body = <ListSkeleton />
  } else if (conversations!.length === 0) {
    body = <EmptyState filter="all" />
  } else if (q && shown.length === 0) {
    body = (
      <div style={{ padding: '64px 20px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14 }}>
        No chats match &ldquo;{search.trim()}&rdquo;.
      </div>
    )
  } else if (filter === 'unread') {
    // Unread: anything with unread messages that isn't hidden, newest first.
    const unread = shown.filter(c => !c.hidden && c.unread_count > 0)
    body = unread.length === 0
      ? <EmptyState filter="unread" />
      : <div>{unread.map(c => <ConversationRow key={c.id} conv={c} />)}</div>
  } else {
    // All and Direct: every chat here is one-to-one today (no group chats yet),
    // so Direct shows the same list; it starts to differ once groups exist.
    const visible = shown.filter(c => !c.hidden)
    const active = visible.filter(c => !c.lock)
    const inactive = visible.filter(c => c.lock)
    const hidden = shown.filter(c => c.hidden)
    const unreadIn = (list: ChatListConversation[]) => list.reduce((n, c) => n + (c.unread_count > 0 ? 1 : 0), 0)

    body = (
      <div>
        {active.map(c => <ConversationRow key={c.id} conv={c} />)}

        {inactive.length > 0 && (
          <>
            {sectionHeader('Inactive chats', inactive.length, showInactive, () => setShowInactive(v => !v), unreadIn(inactive))}
            {showInactive && (
              <>
                <p style={{ margin: 0, padding: '10px 20px', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                  You can read these, but not reply until you follow each other again.
                </p>
                {inactive.map(c => <ConversationRow key={c.id} conv={c} />)}
              </>
            )}
          </>
        )}

        {hidden.length > 0 && (
          <>
            {sectionHeader('Hidden chats', hidden.length, showHidden, () => setShowHidden(v => !v), 0)}
            {showHidden && hidden.map(c => <ConversationRow key={c.id} conv={c} hiddenRow onUnhide={handleUnhide} />)}
          </>
        )}
      </div>
    )
  }

  const hasUnread = !!conversations?.some(c => c.unread_count > 0)

  return (
    <div>
      <HideMobileHeader />
      <ChatListHeader
        filter={filter} onFilterChange={setFilter} onMarkAllRead={handleMarkAllRead} canMarkAllRead={hasUnread}
        search={search} onSearchChange={setSearch}
      />
      {body}
    </div>
  )
}