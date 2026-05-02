'use client'

// src/app/(main)/messages/[id]/chat-client.tsx

import { useState, useEffect, useRef, useTransition } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { sendMessageAction, deleteMessageAction } from '@/lib/actions/messages'
import { formatRelativeTime } from '@/lib/utils'
import { ArrowLeft, Send, X, Trash2, CornerUpLeft } from 'lucide-react'
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
}

interface ChatClientProps {
  conversationId: string
  initialMessages: Message[]
  currentUserId: string
  otherUser: { id: string; username: string; display_name: string; avatar_url: string | null; verification_tier: string }
}

export default function ChatClient({ conversationId, initialMessages, currentUserId, otherUser }: ChatClientProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [isPending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const otherInitials = otherUser.display_name?.slice(0, 2).toUpperCase() ?? '??'
  const otherColor = AVATAR_COLORS[(otherUser.username?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime subscription
  useEffect(() => {
    const supabase = createBrowserClient()
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, async payload => {
        const newMsg = payload.new as any
        // Fetch full message with sender info
        const { data } = await supabase
          .from('messages')
          .select(`id, body, sender_id, created_at, is_deleted, read_at,
            sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url),
            reply_to:messages!messages_reply_to_id_fkey(id, body, sender:users!messages_sender_id_fkey(display_name))
          `)
          .eq('id', newMsg.id).single()
        if (data) setMessages(prev => [...prev, data as any])
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, payload => {
        const u = payload.new as any
        setMessages(prev => prev.map(m => m.id === u.id ? { ...m, ...u } : m))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId])

  function handleSend() {
    if (!body.trim() || isPending) return
    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      body: body.trim(),
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
    }
    setMessages(prev => [...prev, optimisticMsg])
    const sentBody = body.trim()
    const sentReplyTo = replyTo?.id
    setBody('')
    setReplyTo(null)
    startTransition(async () => {
      await sendMessageAction(conversationId, sentBody, sentReplyTo)
      // Realtime will replace the optimistic message
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleDelete(msgId: string) {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true, body: null } : m))
    startTransition(async () => { await deleteMessageAction(msgId) })
  }

  // Group messages by date
  const grouped = messages.reduce((acc: { date: string; msgs: Message[] }[], msg) => {
    const date = new Date(msg.created_at).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'short' })
    const last = acc[acc.length - 1]
    if (last?.date === date) last.msgs.push(msg)
    else acc.push({ date, msgs: [msg] })
    return acc
  }, [])

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
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>@{otherUser.username}</div>
          </div>
        </Link>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {grouped.map(({ date, msgs }) => (
          <div key={date}>
            {/* Date separator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 12px' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{date}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            </div>

            {msgs.map((msg, i) => {
              const isMine = msg.sender_id === currentUserId
              const prevMsg = msgs[i - 1]
              const isGrouped = prevMsg?.sender_id === msg.sender_id &&
                new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 60000

              return (
                <div key={msg.id} style={{
                  display: 'flex',
                  flexDirection: isMine ? 'row-reverse' : 'row',
                  alignItems: 'flex-end', gap: 8,
                  marginBottom: isGrouped ? 2 : 10,
                }}>
                  {/* Avatar — only show on first in group */}
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
                  <div style={{ maxWidth: '72%', position: 'relative' }} className="msg-group">
                    {/* Reply preview */}
                    {msg.reply_to && !msg.is_deleted && (
                      <div style={{
                        background: isMine ? 'rgba(255,255,255,0.1)' : 'var(--color-surface-3)',
                        borderLeft: `3px solid var(--color-brand)`,
                        borderRadius: '8px 8px 0 0',
                        padding: '6px 10px',
                        marginBottom: -4,
                      }}>
                        <div style={{ fontSize: 11, color: 'var(--color-brand)', fontWeight: 600, marginBottom: 2 }}>
                          {msg.reply_to.sender?.display_name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {msg.reply_to.body ?? '🗑 Deleted message'}
                        </div>
                      </div>
                    )}

                    <div style={{
                      background: isMine ? 'var(--color-brand)' : 'var(--color-surface-2)',
                      color: isMine ? 'white' : 'var(--color-text-primary)',
                      padding: '9px 13px',
                      borderRadius: isMine
                        ? (isGrouped ? '18px 4px 4px 18px' : '18px 4px 18px 18px')
                        : (isGrouped ? '4px 18px 18px 4px' : '4px 18px 18px 18px'),
                      fontSize: 14, lineHeight: 1.5,
                      fontFamily: "'DM Sans', sans-serif",
                      wordBreak: 'break-word',
                    }}>
                      {msg.is_deleted
                        ? <em style={{ opacity: 0.6, fontSize: 13 }}>🗑 Message deleted</em>
                        : msg.body
                      }
                    </div>

                    {/* Timestamp + actions on hover */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      justifyContent: isMine ? 'flex-end' : 'flex-start',
                      marginTop: 3,
                    }}>
                      <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                        {new Date(msg.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMine && !msg.is_deleted && msg.read_at && (
                        <span style={{ fontSize: 10, color: 'var(--color-brand)' }}>✓✓</span>
                      )}
                      {isMine && !msg.is_deleted && !msg.read_at && (
                        <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>✓</span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  {!msg.is_deleted && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: 0, transition: 'opacity 0.15s' }} className="msg-actions">
                      <button
                        onClick={() => { setReplyTo(msg); inputRef.current?.focus() }}
                        style={{ background: 'var(--color-surface-2)', border: 'none', borderRadius: 8, padding: 5, cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                      >
                        <CornerUpLeft size={13} />
                      </button>
                      {isMine && (
                        <button
                          onClick={() => handleDelete(msg.id)}
                          style={{ background: 'var(--color-surface-2)', border: 'none', borderRadius: 8, padding: 5, cursor: 'pointer', color: 'var(--color-error)' }}
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

      {/* Reply preview */}
      {replyTo && (
        <div style={{
          padding: '8px 16px', background: 'var(--color-surface-2)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--color-brand)', fontWeight: 600, marginBottom: 2 }}>
              Replying to {replyTo.sender?.display_name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {replyTo.body}
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
          onClick={handleSend}
          disabled={!body.trim() || isPending}
          style={{
            width: 42, height: 42, borderRadius: '50%',
            background: body.trim() ? 'var(--color-brand)' : 'var(--color-surface-2)',
            border: 'none', cursor: body.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background 0.15s',
          }}
        >
          <Send size={17} color={body.trim() ? 'white' : 'var(--color-text-muted)'} />
        </button>
      </div>

      <style>{`
        .msg-group:hover .msg-actions { opacity: 1 !important; }
      `}</style>
    </div>
  )
}