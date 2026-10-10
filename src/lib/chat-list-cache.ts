// src/lib/chat-list-cache.ts
//
// Last-known conversation list, kept on the device so the Chat screen can paint
// instantly (like WhatsApp) and refresh quietly in the background, instead of
// showing a skeleton/spinner and waiting for the server on every visit.
//
//  - memory   : survives in-app navigation (Feed -> Chat -> Feed -> Chat ...)
//  - storage  : survives closing/reopening the app, so even a cold start has
//               something to show while the first refresh runs
//
// What is stored: names, avatars, counts, timestamps and the SAME ciphertext the
// server already holds for previews. Decrypted previews live in memory only
// (never written to storage) - they are rebuilt from the local key on demand, so
// end-to-end encryption and the PIN gate are not weakened.
//
// The cache belongs to one account. ChatCacheGuard (mounted in the (main)
// layout) calls claimChatListCache(userId) so a different account never sees it.

export type LastMessageStatus = 'sent' | 'delivered' | 'read'

export interface ChatListConversation {
  id: string
  other: { id: string; username: string; display_name: string; avatar_url: string | null; verification_tier: string } | null
  last_message_preview: string | null
  last_message_at: string | null
  /** The newest message was sent by me - drives the tick shown next to the preview. */
  last_message_mine: boolean
  /** Delivery state of that newest message (only meaningful when last_message_mine). */
  last_message_status: LastMessageStatus | null
  unread_count: number
  /** Why the thread is read-only (blocked / no longer mutual). null = normal. */
  lock: 'blocked_by_me' | 'not_mutual' | null
  /** Hidden by me (the other person's copy is untouched). */
  hidden: boolean
}

const STORAGE_KEY = 'spup:chat-list:v1'

interface Snapshot {
  userId: string
  conversations: ChatListConversation[]
  savedAt: number
}

let mem: Snapshot | null = null

/** Decrypted preview text by ciphertext. Memory only - never persisted. */
export const decryptedPreviews = new Map<string, string>()
/** Derived ECDH keys by `${userId}:${peerId}` (null = peer has no key). Memory only. */
export const sharedPreviewKeys = new Map<string, CryptoKey | null>()

const isBrowser = () => typeof window !== 'undefined'

/** Newest first; conversations without a timestamp last. */
export function sortConversations<T extends { last_message_at: string | null }>(list: T[]): T[] {
  const t = (c: T) => (c.last_message_at ? Date.parse(c.last_message_at) || 0 : 0)
  return [...list].sort((a, b) => t(b) - t(a))
}

/** A chat with nothing in it yet is not shown in the list. */
export function hasMessage(c: { last_message_preview: string | null }): boolean {
  return c.last_message_preview !== null && c.last_message_preview !== ''
}

function loadFromStorage(): Snapshot | null {
  if (!isBrowser()) return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Snapshot
    if (!parsed || typeof parsed.userId !== 'string' || !Array.isArray(parsed.conversations)) return null
    return parsed
  } catch {
    return null
  }
}

function persist() {
  if (!isBrowser() || !mem) return
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mem)) } catch { /* private mode / quota */ }
}

/** Memory only - safe to call while rendering (never differs between server and first client paint). */
export function peekChatListMemory(userId?: string): ChatListConversation[] | null {
  if (!mem) return null
  if (userId && mem.userId !== userId) return null
  return mem.conversations
}

/** Memory first, then device storage. Call from an effect, not during render. */
export function readChatListCache(userId?: string): ChatListConversation[] | null {
  if (!mem) mem = loadFromStorage()
  if (!mem) return null
  if (userId && mem.userId !== userId) return null
  return mem.conversations
}

export function writeChatListCache(userId: string, conversations: ChatListConversation[]) {
  mem = { userId, conversations, savedAt: Date.now() }
  persist()
}

/** Update one cached conversation (e.g. after reading or sending in the thread) and re-sort. */
export function patchChatListCache(userId: string, conversationId: string, patch: Partial<ChatListConversation>) {
  if (!mem) mem = loadFromStorage()
  if (!mem || mem.userId !== userId) return
  if (!mem.conversations.some(c => c.id === conversationId)) return
  mem = {
    ...mem,
    conversations: sortConversations(mem.conversations.map(c => (c.id === conversationId ? { ...c, ...patch } : c))),
  }
  persist()
}

export function clearChatListCache() {
  mem = null
  decryptedPreviews.clear()
  sharedPreviewKeys.clear()
  if (!isBrowser()) return
  try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

/** Make the cache belong to `userId`: anything cached for someone else is dropped. */
export function claimChatListCache(userId: string) {
  if (!mem) mem = loadFromStorage()
  if (mem && mem.userId !== userId) clearChatListCache()
}
