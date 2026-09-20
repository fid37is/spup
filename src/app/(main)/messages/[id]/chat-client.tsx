'use client'

// src/app/(main)/messages/[id]/chat-client.tsx

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { createBrowserClient } from '@/lib/supabase/client'
import {
  sendMessageAction, deleteMessageAction, uploadPublicKeyAction, getPublicKeyAction,
  uploadWrappedKeyAction, getWrappedKeyAction, verifyChatPinAction,
} from '@/lib/actions/messages'
import { recoverOrCreateKeyPair, deriveSharedKey, encryptMessage, decryptMessage, isEncrypted } from '@/lib/chat-crypto'
import { getSessionPinMaterial } from '@/lib/chat-pin-session'
import { ArrowLeft, Send, X, Trash2, CornerUpLeft, Lock, CheckCheck, Check, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import ConfirmModal from '@/components/ui/confirm-modal'

const AVATAR_COLORS = ['#1A9E5F','#7A3A1A','#1A4A7A','#4A1A7A','#7A6A1A']

interface Message {
  id: string
  body: string | null
  sender_id: string
  created_at: string
  is_deleted: boolean
  read_at: string | null
  sender: { id: string; display_name: string; avatar_url: string | null; username: string } | null
  reply_to: { id: string; body: string | null; sender: { display_name: string } | null } | null
  _plaintext?: string    // decrypted body for display
  _optimistic?: boolean  // true while waiting for realtime confirmation
}

interface ChatClientProps {
  conversationId: string
  initialMessages: Message[]
  currentUserId: string
  otherUser: {
    id: string; username: string; display_name: string
    avatar_url: string | null; verification_tier: string
  }
}

export default function ChatClient({
  conversationId, initialMessages, currentUserId, otherUser,
}: ChatClientProps) {
  const [messages,     setMessages]    = useState<Message[]>(initialMessages)
  const [body,         setBody]        = useState('')
  const [replyTo,      setReplyTo]     = useState<Message | null>(null)
  const [, startTransition]            = useTransition()
  const [sharedKey,    setSharedKey]   = useState<CryptoKey | null>(null)
  const [cryptoReady,  setCryptoReady] = useState(false)
  const [sendSuccess,  setSendSuccess] = useState(false)
  const [isPending,    setIsPending]   = useState(false)

  // ── New-device key recovery: PIN prompt fallback ──────────────────────────
  // The common path needs no prompt at all — PinGate (mounted on every
  // messages page, see pin-gate.tsx) already collects the PIN and stashes
  // PIN+pepper via chat-pin-session, so getKeyMaterial() below usually
  // resolves instantly with no UI shown here. This modal only appears in
  // the rare case where that session material isn't available (e.g.
  // PinGate unlocked via its sessionStorage fast path earlier and this
  // tab's in-memory material was since cleared) but a new device still
  // needs to recover its E2E key. Correctness is checked server-side via
  // verifyChatPinAction before the promise ever resolves, so a wrong PIN
  // just re-shows this same prompt rather than needing a retry loop
  // around recoverOrCreateKeyPair itself.
  const [pinPrompt, setPinPrompt] = useState<{ error: string | null } | null>(null)
  // Portaled to document.body below — see the note on ConfirmModal for why.
  // (This dialog's zIndex was also previously 100, identical to the mobile
  // bottom nav's — a tie that let DOM order decide, and the nav always won,
  // covering the "Not now" / submit buttons.)
  const [portalMounted, setPortalMounted] = useState(false)
  useEffect(() => setPortalMounted(true), [])
  const [pinInput,  setPinInput]  = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingMsg, setDeletingMsg] = useState(false)
  const pinResolveRef = useRef<((material: string | null) => void) | null>(null)

  const getKeyMaterial = useCallback((): Promise<string | null> => {
    const cached = getSessionPinMaterial()
    if (cached) return Promise.resolve(`${cached.pin}:${cached.pepper}`)
    return new Promise(resolve => {
      pinResolveRef.current = resolve
      setPinPrompt({ error: null })
    })
  }, [])

  async function submitPin() {
    if (!/^\d{4}$/.test(pinInput)) return
    const result = await verifyChatPinAction(pinInput)
    if (!result.valid || !result.pepper) {
      setPinPrompt({ error: 'Incorrect PIN — try again.' })
      setPinInput('')
      return
    }
    pinResolveRef.current?.(`${pinInput}:${result.pepper}`)
    pinResolveRef.current = null
    setPinInput('')
    setPinPrompt(null)
  }

  function cancelPinPrompt() {
    pinResolveRef.current?.(null)
    pinResolveRef.current = null
    setPinInput('')
    setPinPrompt(null)
  }

  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)
  const supabase   = useRef(createBrowserClient())

  const otherInitials = otherUser.display_name?.slice(0, 2).toUpperCase() ?? '??'
  const otherColor    = AVATAR_COLORS[(otherUser.username?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]

  // ── Decrypt a single message body ──────────────────────────────────────────
  const decryptBody = useCallback(async (raw: string | null): Promise<string | null> => {
    if (!raw || !sharedKey) return raw
    if (isEncrypted(raw)) return decryptMessage(raw, sharedKey)
    return raw
  }, [sharedKey])

  // ── Decrypt all initial messages ───────────────────────────────────────────
  useEffect(() => {
    if (!sharedKey) return
    ;(async () => {
      const decrypted = await Promise.all(
        messages.map(async m => ({
          ...m,
          _plaintext: m.body ? await decryptBody(m.body) ?? undefined : undefined,
        }))
      )
      setMessages(decrypted)
    })()
  }, [sharedKey]) // only runs when key is ready, not on every message change

  // ── E2E crypto init ────────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      try {
        // No retry loop needed here: getKeyMaterial() above only ever
        // resolves with a PIN that's already been confirmed correct
        // (either by PinGate's prior unlock, or by submitPin's own
        // verifyChatPinAction check) — so a WrongPasswordError at this
        // point means something's actually corrupted, not a mistyped PIN.
        const pair = await recoverOrCreateKeyPair({
          fetchWrapped: async () => (await getWrappedKeyAction()).wrapped,
          uploadWrapped: async (wrapped, salt, iv) => { await uploadWrappedKeyAction(wrapped, salt, iv) },
          getPassword: getKeyMaterial,
        })

        await uploadPublicKeyAction(pair.publicKeyB64)

        const { publicKey: theirKey } = await getPublicKeyAction(otherUser.id)
        if (theirKey) {
          const shared = await deriveSharedKey(pair.privateKey, theirKey)
          setSharedKey(shared)
        }
      } catch (e) {
        console.warn('Crypto init failed — messages will be unencrypted', e)
      } finally {
        setCryptoReady(true)
      }
    })()
  }, [otherUser.id, getKeyMaterial])

  // ── Request notification permission ───────────────────────────────────────
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // ── Scroll to bottom ───────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    const sb = supabase.current
    const channel = sb
      .channel(`chat:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, async payload => {
        const raw = payload.new as any

        // Fetch full message with joins
        const { data } = await sb
          .from('messages')
          .select(`
            id, body, sender_id, created_at, is_deleted, read_at,
            sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url),
            reply_to:messages!messages_reply_to_id_fkey(
              id, body, sender:users!messages_sender_id_fkey(display_name)
            )
          `)
          .eq('id', raw.id)
          .single()

        if (!data) return

        const newMsg = data as unknown as Message
        const plaintext = await decryptBody(newMsg.body)

        setMessages(prev => {
          // Remove matching optimistic message (same sender + plaintext body)
          const withoutOptimistic = prev.filter(m =>
            !(m._optimistic && m.sender_id === newMsg.sender_id && m._plaintext === plaintext)
          )
          // Avoid duplicates (realtime can fire twice)
          if (withoutOptimistic.some(m => m.id === newMsg.id)) return withoutOptimistic
          return [...withoutOptimistic, { ...newMsg, _plaintext: plaintext ?? undefined }]
        })

        // Mark as read if from other user and window is visible
        if (raw.sender_id !== currentUserId) {
          if (document.visibilityState === 'visible') {
            await sb.from('messages')
              .update({ read_at: new Date().toISOString() })
              .eq('id', raw.id)
          }

          // Browser notification if tab is not focused
          if (document.visibilityState === 'hidden' && Notification.permission === 'granted') {
            new Notification(otherUser.display_name, {
              body: plaintext ?? 'New message',
              icon: otherUser.avatar_url ?? '/icon-192.png',
              tag: `chat-${conversationId}`,
            })
          }
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, payload => {
        const u = payload.new as any
        setMessages(prev => prev.map(m =>
          m.id === u.id ? { ...m, ...u } : m
        ))
      })
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [conversationId, currentUserId, decryptBody, otherUser])

  // ── Send ───────────────────────────────────────────────────────────────────
  async function handleSend() {
    const text = body.trim()
    if (!text || isPending) return

    // Encrypt if key is ready
    let wireBody = text
    if (sharedKey) {
      wireBody = await encryptMessage(text, sharedKey)
    }

    // Optimistic update — show plaintext immediately
    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      body: wireBody,
      sender_id: currentUserId,
      created_at: new Date().toISOString(),
      is_deleted: false,
      read_at: null,
      sender: null,
      reply_to: replyTo ? {
        id: replyTo.id,
        body: replyTo.body,
        sender: replyTo.sender ? { display_name: replyTo.sender.display_name } : null,
      } : null,
      _plaintext: text,
      _optimistic: true,
    }

    setMessages(prev => [...prev, optimisticMsg])
    setBody('')
    setReplyTo(null)
    if (inputRef.current) { inputRef.current.style.height = 'auto' }

    const replyId = replyTo?.id
    setIsPending(true)
    const result = await sendMessageAction(conversationId, wireBody, replyId)
    setIsPending(false)

    if (result && 'error' in result && result.error) {
      // Roll back optimistic
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
      setBody(text)
    } else {
      // Brief success flash
      setSendSuccess(true)
      setTimeout(() => setSendSuccess(false), 1200)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
  }

  function handleDelete(msgId: string) {
    setDeleteConfirmId(msgId)
  }

  function confirmDeleteMessage() {
    const msgId = deleteConfirmId
    if (!msgId) return
    setDeletingMsg(true)
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, is_deleted: true, body: null, _plaintext: undefined } : m
    ))
    startTransition(async () => {
      await deleteMessageAction(msgId)
      setDeletingMsg(false)
      setDeleteConfirmId(null)
    })
  }

  // ── Group by date ──────────────────────────────────────────────────────────
  const grouped = messages.reduce((acc: { date: string; msgs: Message[] }[], msg) => {
    const date = new Date(msg.created_at).toLocaleDateString('en-NG', {
      weekday: 'long', day: 'numeric', month: 'short',
    })
    const last = acc[acc.length - 1]
    if (last?.date === date) last.msgs.push(msg)
    else acc.push({ date, msgs: [msg] })
    return acc
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>

      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <Link href="/messages" style={{ color: 'var(--color-text-primary)', display: 'flex', flexShrink: 0 }}>
          <ArrowLeft size={20} />
        </Link>
        <Link href={`/user/${otherUser.username}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flex: 1, minWidth: 0 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
            background: otherUser.avatar_url ? 'transparent' : otherColor,
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 13, color: 'white',
          }}>
            {otherUser.avatar_url
              ? <img src={otherUser.avatar_url} alt={otherUser.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : otherInitials
            }
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {otherUser.display_name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Lock size={9} />
              End-to-end encrypted
            </div>
          </div>
        </Link>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {grouped.map(({ date, msgs }) => (
          <div key={date}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 12px' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{date}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            </div>

            {msgs.map((msg, i) => {
              const isMine    = msg.sender_id === currentUserId
              const prevMsg   = msgs[i - 1]
              const isGrouped = prevMsg?.sender_id === msg.sender_id &&
                new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 60_000
              const displayText = msg.is_deleted ? null : (msg._plaintext ?? msg.body)

              return (
                <div key={msg.id} style={{
                  display: 'flex',
                  flexDirection: isMine ? 'row-reverse' : 'row',
                  alignItems: 'flex-end', gap: 8,
                  marginBottom: isGrouped ? 2 : 10,
                }}>
                  {/* Avatar */}
                  {!isMine && (
                    <div style={{ width: 28, flexShrink: 0 }}>
                      {!isGrouped && (
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: otherUser.avatar_url ? 'transparent' : otherColor,
                          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 800, color: 'white', fontFamily: "'Syne', sans-serif",
                        }}>
                          {otherUser.avatar_url
                            ? <img src={otherUser.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : otherInitials
                          }
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bubble */}
                  <div style={{ maxWidth: '72%', position: 'relative' }}>
                    {/* Reply preview */}
                    {msg.reply_to && !msg.is_deleted && (
                      <div style={{
                        background: isMine ? 'rgba(255,255,255,0.1)' : 'var(--color-surface-3)',
                        borderLeft: '3px solid var(--color-brand)',
                        borderRadius: '8px 8px 0 0', padding: '6px 10px', marginBottom: -4,
                      }}>
                        <div style={{ fontSize: 11, color: 'var(--color-brand)', fontWeight: 600, marginBottom: 2 }}>
                          {msg.reply_to.sender?.display_name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {msg.reply_to.body ?? '🗑 Deleted'}
                        </div>
                      </div>
                    )}

                    <div style={{
                      background: msg._optimistic
                        ? (isMine ? 'var(--color-brand-dim, #0d5c38)' : 'var(--color-surface-2)')
                        : (isMine ? 'var(--color-brand)' : 'var(--color-surface-2)'),
                      color: isMine ? 'white' : 'var(--color-text-primary)',
                      padding: '9px 13px',
                      borderRadius: isMine
                        ? (isGrouped ? '18px 4px 4px 18px' : '18px 4px 18px 18px')
                        : (isGrouped ? '4px 18px 18px 4px' : '4px 18px 18px 18px'),
                      fontSize: 14, lineHeight: 1.5,
                      fontFamily: "'DM Sans', sans-serif",
                      wordBreak: 'break-word',
                      opacity: msg._optimistic ? 0.75 : 1,
                      transition: 'opacity 0.2s',
                    }}>
                      {msg.is_deleted
                        ? <em style={{ opacity: 0.6, fontSize: 13 }}>🗑 Message deleted</em>
                        : displayText
                      }
                    </div>

                    {/* Timestamp + read receipt */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      justifyContent: isMine ? 'flex-end' : 'flex-start',
                      marginTop: 3,
                    }}>
                      <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                        {new Date(msg.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMine && !msg.is_deleted && !msg._optimistic && (
                        msg.read_at
                          ? <CheckCheck size={12} color="var(--color-brand)" />
                          : <Check size={12} color="var(--color-text-secondary)" />
                      )}
                    </div>
                  </div>

                  {/* Actions — visible on hover (desktop) + long-press tap area (mobile) */}
                  {!msg.is_deleted && !msg._optimistic && (
                    <div className="msg-actions" style={{
                      display: 'flex', flexDirection: 'column', gap: 4,
                      opacity: 0, transition: 'opacity 0.15s',
                    }}>
                      <button
                        onClick={() => { setReplyTo(msg); inputRef.current?.focus() }}
                        style={{ background: 'var(--color-surface-2)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex' }}
                        title="Reply"
                      >
                        <CornerUpLeft size={13} />
                      </button>
                      {isMine && (
                        <button
                          onClick={() => handleDelete(msg.id)}
                          style={{ background: 'var(--color-surface-2)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'var(--color-error)', display: 'flex' }}
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply banner */}
      {replyTo && (
        <div style={{
          padding: '8px 16px', background: 'var(--color-surface-2)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--color-brand)', fontWeight: 600, marginBottom: 2 }}>
              Replying to {replyTo.sender?.display_name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {replyTo._plaintext ?? replyTo.body}
            </div>
          </div>
          <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Encryption status banner — shown briefly when crypto is ready */}
      {cryptoReady && !sharedKey && (
        <div style={{ padding: '6px 16px', background: 'rgba(229,57,53,0.08)', borderTop: '1px solid rgba(229,57,53,0.15)', fontSize: 12, color: 'var(--color-error)', textAlign: 'center', flexShrink: 0 }}>
          ⚠️ Encryption unavailable — {otherUser.display_name} hasn't set up their key yet
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--nav-bg)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'flex-end', gap: 10,
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
        flexShrink: 0,
      }}>
        <textarea
          ref={inputRef}
          value={body}
          onChange={e => {
            setBody(e.target.value)
            const ta = e.target
            ta.style.height = 'auto'
            ta.style.height = ta.scrollHeight + 'px'
          }}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          rows={1}
          style={{
            flex: 1,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 22,
            padding: '10px 16px',
            fontSize: 15,
            color: 'var(--color-text-primary)',
            fontFamily: "'DM Sans', sans-serif",
            outline: 'none', resize: 'none',
            caretColor: 'var(--color-brand)',
            minHeight: 40, maxHeight: 120,
            lineHeight: 1.4,
          }}
        />
        <button
          onClick={() => void handleSend()}
          disabled={!body.trim() || isPending}
          style={{
            width: 42, height: 42, borderRadius: '50%',
            background: sendSuccess ? '#1A7A4A' : body.trim() ? 'var(--color-brand)' : 'var(--color-surface-2)',
            border: 'none', cursor: body.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background 0.2s',
          }}
        >
          {sendSuccess
            ? <CheckCheck size={17} color="white" />
            : <Send size={17} color={body.trim() ? 'white' : 'var(--color-text-muted)'} />
          }
        </button>
      </div>

      <style>{`
        .msg-actions { touch-action: none; }
        @media (hover: hover) {
          .msg-group:hover .msg-actions,
          .msg-bubble:hover + .msg-actions { opacity: 1 !important; }
        }
        /* Mobile: tap and hold parent to reveal */
        @media (hover: none) {
          .msg-actions { opacity: 0.45 !important; }
        }
      `}</style>

      {/* New-device password prompt — only shown when this device has no
          cached key but the server has one wrapped from another device. */}
      {pinPrompt && portalMounted && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 360,
            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
            borderRadius: 16, padding: 24,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', background: 'var(--color-surface-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
            }}>
              <Lock size={18} color="var(--color-brand)" />
            </div>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 17, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              Unlock encrypted messages
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5, marginBottom: 16 }}>
              This is a new device. Enter your chat PIN to unlock your encrypted message history here — the same 4-digit PIN you use to open chat.
            </p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pinInput}
              onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={e => { if (e.key === 'Enter' && pinInput.length === 4) submitPin() }}
              placeholder="4-digit PIN"
              style={{
                width: '100%', padding: '11px 14px', marginBottom: pinPrompt.error ? 8 : 16,
                background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                borderRadius: 10, fontSize: 18, letterSpacing: 6, textAlign: 'center',
                color: 'var(--color-text-primary)',
                fontFamily: "'DM Sans', sans-serif", outline: 'none',
              }}
            />
            {pinPrompt.error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <AlertCircle size={13} color="var(--color-error)" />
                <span style={{ fontSize: 12, color: 'var(--color-error)' }}>{pinPrompt.error}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={cancelPinPrompt}
                style={{
                  flex: 1, padding: '11px', borderRadius: 10, border: '1px solid var(--color-border)',
                  background: 'none', color: 'var(--color-text-secondary)', fontWeight: 700,
                  fontFamily: "'Syne', sans-serif", fontSize: 14, cursor: 'pointer',
                }}
              >
                Not now
              </button>
              <button
                onClick={submitPin}
                disabled={pinInput.length !== 4}
                style={{
                  flex: 1, padding: '11px', borderRadius: 10, border: 'none',
                  background: pinInput.length === 4 ? 'var(--color-brand)' : 'var(--color-surface-2)',
                  color: pinInput.length === 4 ? 'white' : 'var(--color-text-muted)',
                  fontWeight: 700, fontFamily: "'Syne', sans-serif", fontSize: 14,
                  cursor: pinInput.length === 4 ? 'pointer' : 'not-allowed',
                }}
              >
                Unlock
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete message confirmation */}
      <ConfirmModal
        open={!!deleteConfirmId}
        title="Delete message?"
        description="This can't be undone. It will be removed for you and, if this chat is encrypted, from this device's history."
        confirmLabel="Delete"
        confirmingLabel="Deleting…"
        destructive
        pending={deletingMsg}
        onConfirm={confirmDeleteMessage}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  )
}