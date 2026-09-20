'use client'

// src/app/(main)/messages/[id]/chat-client.tsx

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import {
  sendMessageAction, deleteMessageAction, uploadPublicKeyAction, getPublicKeyAction,
  verifyChatPinAction, getWrappedKeyAction, uploadWrappedKeyAction,
} from '@/lib/actions/messages'
import { recoverOrCreateKeyPair, deriveSharedKey, encryptMessage, decryptMessage, isEncrypted, WrongPasswordError } from '@/lib/chat-crypto'
import { getSessionPinMaterial, setSessionPinMaterial } from '@/lib/chat-pin-session'
import { ArrowLeft, Send, X, Trash2, CornerUpLeft, Lock, CheckCheck, Check } from 'lucide-react'
import Link from 'next/link'

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
  const [sendSuccess,  setSendSuccess] = useState(false)
  const [isPending,    setIsPending]   = useState(false)

  // Fallback PIN prompt for recoverOrCreateKeyPair(): only shown when
  // getSessionPinMaterial() is empty (e.g. this tab reloaded after PinGate
  // already unlocked it — sessionStorage still says "unlocked" so PinGate
  // won't re-ask, but the in-memory PIN+pepper was cleared on reload).
  const [pinPromptOpen,  setPinPromptOpen]  = useState(false)
  const [pinDigits,      setPinDigits]      = useState('')
  const [pinPromptError, setPinPromptError] = useState('')
  const [pinBusy,        setPinBusy]        = useState(false)
  const pinResolverRef = useRef<((password: string | null) => void) | null>(null)

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

  // Supplies recoverOrCreateKeyPair() with `${pin}:${pepper}`. The common
  // case (PinGate unlocked this same page load) resolves instantly from the
  // in-memory session material with no UI. Only when that's empty do we
  // show a prompt — and only submitPinPrompt() resolves it, and only after
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
      setPinPromptError('noPin' in result && result.noPin ? "No chat PIN is set for this account yet." : 'Incorrect PIN. Try again.')
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

  // ── E2E crypto init ────────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      try {
        const { publicKeyB64, privateKey } = await recoverOrCreateKeyPair({
          fetchWrapped: async () => (await getWrappedKeyAction()).wrapped ?? null,
          uploadWrapped: async (wrapped, salt, iv) => { await uploadWrappedKeyAction(wrapped, salt, iv) },
          getPassword,
        })
        await uploadPublicKeyAction(publicKeyB64)

        const { publicKey: theirKey } = await getPublicKeyAction(otherUser.id)
        if (theirKey) {
          const shared = await deriveSharedKey(privateKey, theirKey)
          setSharedKey(shared)
        }
      } catch (e) {
        if (e instanceof WrongPasswordError) {
          // Only possible if the stored pepper doesn't match the wrapped
          // key at all (data inconsistency) — a wrong PIN is already
          // rejected inside submitPinPrompt before it ever gets here.
          console.warn('Chat key recovery: PIN did not unlock the saved key', e)
        } else {
          console.warn('Crypto init failed — messages will be unencrypted', e)
        }
      } finally {
        setPinPromptOpen(false)
        pinResolverRef.current = null
      }
    })()
  }, [otherUser.id, getPassword])

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
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, is_deleted: true, body: null, _plaintext: undefined } : m
    ))
    startTransition(async () => { await deleteMessageAction(msgId) })
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

      {/* Fallback PIN prompt — only shown when recoverOrCreateKeyPair() needs
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
    </div>
  )
}