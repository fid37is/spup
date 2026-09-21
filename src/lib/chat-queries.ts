// src/lib/chat-queries.ts
//
// Shared by the conversation page (server render) and loadMessagesAction, so
// both read messages the same way. Deliberately NOT a 'use server' file: it
// takes a Supabase client as an argument and must not become a callable action.
//
// Why this exists: the old query was a single select with two embedded joins
// (`sender:users!messages_sender_id_fkey`, and a self-join
// `reply_to:messages!messages_reply_to_id_fkey`) plus media_* columns the UI
// never uses. If ANY of those names doesn't match the live database, PostgREST
// rejects the whole query - and the old code turned that error into an empty
// list. The conversation list keeps working (it reads a denormalised preview on
// `conversations`), so it looked like "messages exist but the chat is empty".
//
// This version: selects `*` (works whatever columns exist, including
// delivered_at once migrated), uses no embeds (the client already knows both
// participants), resolves reply targets with a second plain query, and REPORTS
// errors instead of hiding them.

import type { SupabaseClient } from '@supabase/supabase-js'

export const MESSAGE_PAGE_SIZE = 50

export interface ReplyRef {
  id: string
  body: string | null
  sender_id: string
  is_deleted: boolean
}

export interface MessageRow {
  id: string
  conversation_id?: string
  sender_id: string
  body: string | null
  created_at: string
  is_deleted: boolean
  read_at: string | null
  delivered_at?: string | null
  reply_to_id?: string | null
  reply_to?: ReplyRef | null
}

export interface MessagePage {
  messages: MessageRow[]      // oldest -> newest
  hasMore: boolean            // older messages exist beyond this page
  error: string | null
}

export async function fetchMessagePage(
  supabase: SupabaseClient,
  conversationId: string,
  opts: { limit?: number; before?: string } = {},
): Promise<MessagePage> {
  const limit = opts.limit ?? MESSAGE_PAGE_SIZE

  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit + 1) // one extra row tells us whether an older page exists

  if (opts.before) query = query.lt('created_at', opts.before)

  const { data, error } = await query
  if (error) {
    console.error('[chat] fetchMessagePage failed:', { conversationId, code: error.code, message: error.message, details: error.details, hint: error.hint })
    return { messages: [], hasMore: false, error: error.message || 'Could not load messages' }
  }

  const rows = (data ?? []) as MessageRow[]
  const hasMore = rows.length > limit
  const page = rows.slice(0, limit).reverse()

  // Resolve reply targets: mostly inside this page already; fetch the rest.
  const inPage = new Map(page.map(r => [r.id, r]))
  const missing = [...new Set(page.map(r => r.reply_to_id).filter((x): x is string => !!x && !inPage.has(x)))]
  const extra = new Map<string, MessageRow>()
  if (missing.length > 0) {
    const { data: targets, error: tErr } = await supabase
      .from('messages')
      .select('id, body, sender_id, is_deleted')
      .eq('conversation_id', conversationId)
      .in('id', missing)
    if (tErr) console.error('[chat] reply target lookup failed (messages still shown):', tErr.message)
    for (const t of (targets ?? []) as MessageRow[]) extra.set(t.id, t)
  }

  const messages = page.map(r => {
    const t = r.reply_to_id ? (inPage.get(r.reply_to_id) ?? extra.get(r.reply_to_id)) : undefined
    return {
      ...r,
      reply_to: t ? { id: t.id, body: t.is_deleted ? null : t.body, sender_id: t.sender_id, is_deleted: !!t.is_deleted } : null,
    }
  })

  return { messages, hasMore, error: null }
}
