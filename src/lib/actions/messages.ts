'use server'

// src/lib/actions/messages.ts

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'

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

export async function setChatPinAction(pin: string) {
  if (!/^\d{4}$/.test(pin)) return { error: 'PIN must be exactly 4 digits' }
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const pin_hash = await bcrypt.hash(pin, 10)
  const { error } = await supabase.from('chat_pins').upsert(
    { user_id: profile.id, pin_hash, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
  if (error) return { error: error.message }
  return { success: true }
}

export async function verifyChatPinAction(pin: string) {
  if (!/^\d{4}$/.test(pin)) return { valid: false }
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { valid: false }

  const { data } = await supabase
    .from('chat_pins').select('pin_hash').eq('user_id', profile.id).single()
  if (!data) return { valid: false, noPin: true }

  const valid = await bcrypt.compare(pin, data.pin_hash)
  return { valid }
}

export async function hasChatPinAction() {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { hasPin: false }
  const { data } = await supabase
    .from('chat_pins').select('user_id').eq('user_id', profile.id).maybeSingle()
  return { hasPin: !!data }
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

  // Check if conversation already exists
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .or(
      `and(participant_1.eq.${profile.id},participant_2.eq.${targetUserId}),` +
      `and(participant_1.eq.${targetUserId},participant_2.eq.${profile.id})`
    )
    .maybeSingle()

  if (existing) return { conversationId: existing.id }

  // Create new conversation
  const { data: conv, error } = await supabase
    .from('conversations')
    .insert({ participant_1: profile.id, participant_2: targetUserId })
    .select('id').single()

  if (error || !conv) return { error: error?.message || 'Failed to create conversation' }

  // Create member records for both participants
  await supabase.from('conversation_members').insert([
    { conversation_id: conv.id, user_id: profile.id },
    { conversation_id: conv.id, user_id: targetUserId },
  ])

  return { conversationId: conv.id }
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function getMessagesAction(conversationId: string, limit = 50, before?: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return []

  let query = supabase
    .from('messages')
    .select(`
      id, body, media_url, media_type, created_at, read_at, is_deleted,
      sender_id,
      sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url),
      reply_to:messages!messages_reply_to_id_fkey(id, body, sender_id,
        sender:users!messages_sender_id_fkey(display_name)
      )
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) query = query.lt('created_at', before)

  const { data } = await query

  // Mark messages as read
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', profile.id)
    .is('read_at', null)

  // Reset unread count
  await supabase
    .from('conversation_members')
    .update({ unread_count: 0, last_read_at: new Date().toISOString() })
    .match({ conversation_id: conversationId, user_id: profile.id })

  return (data || []).reverse()
}

export async function sendMessageAction(conversationId: string, body: string, replyToId?: string) {
  if (!body.trim()) return { error: 'Message cannot be empty' }
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const { data: msg, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: profile.id,
      body: body.trim(),
      reply_to_id: replyToId || null,
    })
    .select('id, created_at')
    .single()

  if (error || !msg) return { error: error?.message || 'Failed to send' }

  // Update conversation preview
  await supabase.from('conversations').update({
    last_message_at: msg.created_at,
    last_message_preview: body.trim().slice(0, 80),
  }).eq('id', conversationId)

  // Increment unread for the other participant
  await supabase.rpc('increment_unread', {
    p_conversation_id: conversationId,
    p_sender_id: profile.id,
  })

  revalidatePath(`/messages/${conversationId}`)
  return { success: true, messageId: msg.id }
}

export async function deleteMessageAction(messageId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  await supabase
    .from('messages')
    .update({ is_deleted: true, body: null })
    .match({ id: messageId, sender_id: profile.id })

  return { success: true }
}