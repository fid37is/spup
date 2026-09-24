'use server'

// src/lib/actions/messages.ts

import { createClient } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'
import nodeCrypto from 'crypto'
import { createNotification } from '@/lib/notifications'
import { checkRateLimit } from '@/lib/rate-limit'
import { fetchMessagePage, type MessagePage } from '@/lib/chat-queries'
import { getUnreadChatCount } from '@/lib/queries/chat'

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, profile: null }
  const { data: profile } = await supabase
    .from('users').select('id, username, display_name, avatar_url')
    .eq('auth_id', user.id).single()
  return { supabase, profile }
}

// ── PIN ───────────────────────────────────────────────────────────────────────

// Shown to the user instead of the raw database message (which can expose
// table/column names). The real error is logged on the server.
const PIN_SAVE_ERROR = "We couldn't set your PIN right now. Please try again in a moment."

export async function setChatPinAction(pin: string) {
  if (!/^\d{4}$/.test(pin)) return { error: 'PIN must be exactly 4 digits' }
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  // Reuse the existing pepper if the user is just changing their PIN
  // (their wrapped E2E key was derived from the old pepper + old PIN —
  // rotating the pepper here would orphan it). Only generate a fresh one
  // the first time a PIN is ever set.
  const { data: existing, error: lookupError } = await supabase
    .from('chat_pins').select('key_pepper').eq('user_id', profile.id).maybeSingle()
  if (lookupError) {
    // Don't carry on and mint a new pepper if we couldn't read the old one -
    // that could orphan an existing wrapped key. Log the real cause for us,
    // show the user something they can act on.
    console.error('[setChatPinAction] could not read existing chat_pins row:', lookupError)
    return { error: PIN_SAVE_ERROR }
  }
  const key_pepper = existing?.key_pepper ?? nodeCrypto.randomBytes(32).toString('base64')

  const pin_hash = await bcrypt.hash(pin, 10)
  const { error } = await supabase.from('chat_pins').upsert(
    { user_id: profile.id, pin_hash, key_pepper, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
  if (error) {
    console.error('[setChatPinAction] could not save PIN:', error)
    return { error: PIN_SAVE_ERROR }
  }
  // Returned once, immediately after the PIN this user just chose — safe
  // to hand back here since they've just proven they know it.
  return { success: true, pepper: key_pepper }
}

export async function verifyChatPinAction(pin: string) {
  if (!/^\d{4}$/.test(pin)) return { valid: false }
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { valid: false }

  // A 4-digit PIN is only 10,000 combinations, and a correct guess also hands
  // back the pepper that protects the E2E key backup - so guessing has to be
  // slow. 20 tries / 15 min is far above normal use (one unlock per session,
  // plus the occasional re-prompt after a reload). Fails open if the limiter
  // itself is down (see lib/rate-limit.ts).
  if (!(await checkRateLimit(`chat-pin-verify:${profile.id}`, 20, 15 * 60))) {
    return { valid: false, rateLimited: true as const }
  }

  const { data } = await supabase
    .from('chat_pins').select('pin_hash, key_pepper').eq('user_id', profile.id).single()
  if (!data) return { valid: false, noPin: true }

  const valid = await bcrypt.compare(pin, data.pin_hash)
  // The pepper is only ever handed back on a correct PIN - this is what
  // makes it useless to an attacker who only has a stolen wrapped-key
  // blob (see 022_chat_pin_pepper.sql): they'd still have to pass this
  // live, rate-limited check to get it. userId lets the browser scope its
  // locally-stored E2E key to this account (see lib/chat-crypto.ts).
  return valid
    ? { valid: true, pepper: data.key_pepper as string | null, userId: profile.id as string }
    : { valid: false }
}

export async function hasChatPinAction() {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { hasPin: false }
  const { data } = await supabase
    .from('chat_pins').select('user_id').eq('user_id', profile.id).maybeSingle()
  return { hasPin: !!data }
}


// ── Public key management (E2E encryption) ────────────────────────────────────

export async function uploadPublicKeyAction(publicKeyB64: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  const { error } = await supabase
    .from('users').update({ public_key: publicKeyB64 }).eq('id', profile.id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function getPublicKeyAction(userId: string) {
  const { supabase } = await getCallerProfile()
  const { data } = await supabase
    .from('users').select('public_key').eq('id', userId).single()
  return { publicKey: (data as any)?.public_key ?? null }
}

// ── Wrapped private key (cross-device E2E key recovery) ───────────────────────
// The server only ever stores/returns ciphertext here — the password that
// derives the unwrapping key never leaves the browser. See
// src/lib/chat-crypto.ts (recoverOrCreateKeyPair) for the client-side flow
// that calls these.

export async function uploadWrappedKeyAction(wrapped: string, salt: string, iv: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  const { error } = await supabase
    .from('users')
    .update({ wrapped_private_key: wrapped, key_wrap_salt: salt, key_wrap_iv: iv })
    .eq('id', profile.id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function getWrappedKeyAction() {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { wrapped: null }
  const { data } = await supabase
    .from('users')
    .select('wrapped_private_key, key_wrap_salt, key_wrap_iv')
    .eq('id', profile.id)
    .single()
  if (!data?.wrapped_private_key || !data.key_wrap_salt || !data.key_wrap_iv) return { wrapped: null }
  return { wrapped: { wrapped: data.wrapped_private_key, salt: data.key_wrap_salt, iv: data.key_wrap_iv } }
}

// ── Conversations ─────────────────────────────────────────────────────────────

export async function getConversationsAction() {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return []

  const { data } = await supabase
    .from('conversations')
    .select(`
      id, last_message_at, last_message_preview, created_at,
      participant_1, participant_2,
      p1:users!conversations_participant_1_fkey(id, username, display_name, avatar_url, verification_tier),
      p2:users!conversations_participant_2_fkey(id, username, display_name, avatar_url, verification_tier),
      members:conversation_members(unread_count, user_id)
    `)
    .or(`participant_1.eq.${profile.id},participant_2.eq.${profile.id}`)
    .order('last_message_at', { ascending: false })
    .limit(50)

  return (data || []).map((c: any) => {
    const other = c.participant_1 === profile.id ? c.p2 : c.p1
    const myMembership = (c.members || []).find((m: any) => m.user_id === profile.id)
    return {
      id: c.id,
      other,
      last_message_preview: c.last_message_preview,
      last_message_at: c.last_message_at,
      unread_count: myMembership?.unread_count ?? 0,
    }
  })
}

export async function getOrCreateConversationAction(targetUserId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!targetUserId) return { error: 'Missing user' }
  if (targetUserId === profile.id) return { error: "You can't start a chat with yourself" }

  // Check if conversation already exists. limit(1) instead of maybeSingle():
  // maybeSingle() ERRORS when two rows match (e.g. two chats created by a
  // double-tap), which made this fall through and create a third one.
  const { data: existingRows } = await supabase
    .from('conversations')
    .select('id')
    .or(
      `and(participant_1.eq.${profile.id},participant_2.eq.${targetUserId}),` +
      `and(participant_1.eq.${targetUserId},participant_2.eq.${profile.id})`
    )
    .order('created_at', { ascending: true })
    .limit(1)

  if (existingRows && existingRows.length > 0) return { conversationId: existingRows[0].id }

  // Create new conversation
  const { data: conv, error } = await supabase
    .from('conversations')
    .insert({ participant_1: profile.id, participant_2: targetUserId })
    .select('id').single()

  if (error || !conv) return { error: error?.message || 'Failed to create conversation' }

  // Create member records for both participants (they carry the unread counts)
  const { error: memberError } = await supabase.from('conversation_members').insert([
    { conversation_id: conv.id, user_id: profile.id },
    { conversation_id: conv.id, user_id: targetUserId },
  ])
  if (memberError) console.error('[getOrCreateConversationAction] could not create conversation_members:', memberError.message)

  return { conversationId: conv.id }
}

// ── Messages ──────────────────────────────────────────────────────────────────

const MAX_WIRE_LENGTH = 20_000 // ciphertext is ~1.4x the plaintext; the UI caps text at 4,000 chars

/** The conversation, only if the caller is one of its two participants. */
async function getMyConversation(
  supabase: Awaited<ReturnType<typeof createClient>>, profileId: string, conversationId: string,
) {
  const { data } = await supabase
    .from('conversations')
    .select('id, participant_1, participant_2')
    .eq('id', conversationId)
    .or(`participant_1.eq.${profileId},participant_2.eq.${profileId}`)
    .maybeSingle()
  return data as { id: string; participant_1: string; participant_2: string } | null
}

/**
 * A page of messages (newest page by default, or the page before `before`).
 * PURE READ: it no longer marks anything as read. It used to do that as a side
 * effect of the page render, which told the sender "read" before the recipient
 * had even passed the PIN gate (or when Next merely prefetched the route). Read
 * state now changes only via markConversationReadAction, called by the chat
 * screen once the messages are actually on screen.
 *
 * Errors are RETURNED, not swallowed - see lib/chat-queries.ts for why.
 */
export async function loadMessagesAction(conversationId: string, before?: string): Promise<MessagePage> {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { messages: [], hasMore: false, error: 'Not authenticated' }
  if (!(await getMyConversation(supabase, profile.id, conversationId))) {
    return { messages: [], hasMore: false, error: 'Conversation not found' }
  }
  return fetchMessagePage(supabase, conversationId, { before })
}

/**
 * The recipient's app has the messages (delivered) and/or is showing them
 * (read). Also clears the unread badge for this conversation. Safe to call
 * repeatedly - it only touches rows that still need it.
 *
 * `delivered_at` comes from migration 026; if it hasn't been applied yet that
 * one update fails, is logged, and read receipts keep working.
 */
export async function markConversationReadAction(conversationId: string, level: 'read' | 'delivered' = 'read') {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!(await getMyConversation(supabase, profile.id, conversationId))) return { error: 'Conversation not found' }

  const now = new Date().toISOString()

  if (level === 'read') {
    const { error } = await supabase
      .from('messages')
      .update({ read_at: now })
      .eq('conversation_id', conversationId)
      .neq('sender_id', profile.id)
      .is('read_at', null)
    if (error) { console.error('[markConversationReadAction] read_at update failed:', error.message); return { error: error.message } }
  }

  const { error: dErr } = await supabase
    .from('messages')
    .update({ delivered_at: now })
    .eq('conversation_id', conversationId)
    .neq('sender_id', profile.id)
    .is('delivered_at', null)
  if (dErr) console.warn('[markConversationReadAction] delivered_at update skipped (run migration 026?):', dErr.message)

  if (level === 'read') {
    const { error: uErr } = await supabase
      .from('conversation_members')
      .update({ unread_count: 0, last_read_at: now })
      .match({ conversation_id: conversationId, user_id: profile.id })
    if (uErr) console.error('[markConversationReadAction] unread reset failed:', uErr.message)
  }
  return { success: true }
}

/**
 * The messages list is open on the recipient's device: everything sent to them
 * in any conversation counts as delivered (not read).
 */
export async function markAllDeliveredAction() {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const { data: convs } = await supabase
    .from('conversations')
    .select('id')
    .or(`participant_1.eq.${profile.id},participant_2.eq.${profile.id}`)
    .limit(200)
  const ids = (convs ?? []).map((c: { id: string }) => c.id)
  if (ids.length === 0) return { success: true }

  const { error } = await supabase
    .from('messages')
    .update({ delivered_at: new Date().toISOString() })
    .in('conversation_id', ids)
    .neq('sender_id', profile.id)
    .is('delivered_at', null)
  if (error) console.warn('[markAllDeliveredAction] skipped (run migration 026?):', error.message)
  return { success: true }
}

/** Client-callable refresh for the Chat tab badge (see hooks/use-chat-unread.ts). */
export async function getUnreadChatCountAction(): Promise<number> {
  const { profile } = await getCallerProfile()
  if (!profile) return 0
  return getUnreadChatCount(profile.id)
}

export async function sendMessageAction(conversationId: string, body: string, replyToId?: string) {
  const text = body.trim()
  if (!text) return { error: 'Message cannot be empty' }
  if (text.length > MAX_WIRE_LENGTH) return { error: 'Message is too long' }
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  // Only participants may post (also gives us the recipient for the notification).
  const conv = await getMyConversation(supabase, profile.id, conversationId)
  if (!conv) return { error: 'Conversation not found' }

  if (replyToId) {
    const { data: target } = await supabase
      .from('messages').select('id').eq('id', replyToId).eq('conversation_id', conversationId).maybeSingle()
    if (!target) return { error: 'The message you are replying to no longer exists' }
  }

  const { data: msg, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: profile.id,
      body: text,
      reply_to_id: replyToId || null,
    })
    .select('id, created_at')
    .single()

  if (error || !msg) {
    console.error('[sendMessageAction] insert failed:', error?.message)
    return { error: error?.message || 'Failed to send' }
  }

  // The message is saved - everything below is bookkeeping. Run it together,
  // and never fail the send because of it (but do log, it used to be silent).
  const recipientId = conv.participant_1 === profile.id ? conv.participant_2 : conv.participant_1
  const [previewRes, unreadRes] = await Promise.all([
    supabase.from('conversations').update({
      last_message_at: msg.created_at,
      // Store the real (cipher)text, not a fixed placeholder - the old
      // '[Encrypted message]' string meant every encrypted conversation
      // showed the exact same generic label in the chat list forever, with
      // no way for the client to ever show a real preview. The client
      // decrypts this the same way it decrypts messages in the thread
      // (see messages-list-client.tsx); it only falls back to a generic
      // label if it can't decrypt yet (e.g. key not cached on this device).
      // Ciphertext can't be truncated (AES-GCM needs the full payload to
      // even attempt decryption) - only plaintext gets shortened.
      last_message_preview: text.startsWith('enc:') ? text : text.slice(0, 80),
    }).eq('id', conversationId),
    supabase.rpc('increment_unread', { p_conversation_id: conversationId, p_sender_id: profile.id }),
  ])
  if (previewRes.error) console.error('[sendMessageAction] preview update failed:', previewRes.error.message)
  if (unreadRes.error) console.error('[sendMessageAction] increment_unread failed:', unreadRes.error.message)

  // Messages are surfaced on the Messages icon (unread counts above), not on the
  // Notifications page - and their content is encrypted anyway. So: device push
  // only ("X sent you a message", collapsing per conversation via its tag),
  // no row in the notifications table.
  createNotification({
    recipientId,
    actorId: profile.id,
    type: 'new_message',
    entityId: conversationId,
    entityType: 'conversation',
    inApp: false,
  }).catch(e => console.error('[sendMessageAction] notification failed:', e))

  // No revalidatePath here: the chat screen owns its own state, and revalidating
  // re-rendered the whole page on the server after every single send.
  return { success: true as const, messageId: msg.id as string, createdAt: msg.created_at as string }
}

export async function deleteMessageAction(messageId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('messages')
    .update({ is_deleted: true, body: null })
    .match({ id: messageId, sender_id: profile.id })
    .select('conversation_id, created_at')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Message not found' }

  // If this was the latest message, the list preview still showed its text.
  await supabase
    .from('conversations')
    .update({ last_message_preview: 'Message deleted' })
    .eq('id', data.conversation_id)
    .eq('last_message_at', data.created_at)

  return { success: true }
}