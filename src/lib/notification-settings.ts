// src/lib/notification-settings.ts
//
// Shared (server + client safe) definitions for notification Filters and
// Preferences. Deliberately NOT a 'use server' file so constants/types can be
// exported. The server actions that read/write live in
// lib/actions/notification-settings.ts.

import type { NotificationType } from '@/types'

export interface NotificationSettings {
  // Filters - silence notifications from...
  filter_not_following: boolean
  filter_not_following_you: boolean
  filter_new_accounts: boolean
  filter_default_avatar: boolean
  // Preferences - what you want to hear about
  pref_replies: boolean
  pref_mentions: boolean
  pref_likes: boolean
  pref_reposts: boolean
  pref_follows: boolean
  pref_messages: boolean
  pref_posts: boolean
  pref_wallet: boolean
}

export type NotificationSettingKey = keyof NotificationSettings

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  filter_not_following: false,
  filter_not_following_you: false,
  filter_new_accounts: false,
  filter_default_avatar: false,
  pref_replies: true,
  pref_mentions: true,
  pref_likes: true,
  pref_reposts: true,
  pref_follows: true,
  pref_messages: true,
  pref_posts: true,
  pref_wallet: true,
}

export const NOTIFICATION_SETTING_KEYS = Object.keys(DEFAULT_NOTIFICATION_SETTINGS) as NotificationSettingKey[]

/** Which preference switch governs each notification type. `null` = always delivered. */
export const TYPE_TO_PREF: Record<NotificationType, NotificationSettingKey | null> = {
  new_follower: 'pref_follows',
  post_like: 'pref_likes',
  comment_like: 'pref_likes',
  post_comment: 'pref_replies',
  mention: 'pref_mentions',
  post_repost: 'pref_reposts',
  post_quote: 'pref_reposts',
  new_post: 'pref_posts',
  new_message: 'pref_messages',
  tip_received: 'pref_wallet',
  subscription_new: 'pref_wallet',
  earning_milestone: 'pref_wallet',
  monetisation_approved: 'pref_wallet',
  escrow_hold_received: 'pref_wallet',
  escrow_delivered: 'pref_wallet',
  escrow_released: 'pref_wallet',
  escrow_disputed: 'pref_wallet',
  escrow_proposal: 'pref_wallet',
  escrow_escalated: 'pref_wallet',
  system: null,
}

/**
 * Types produced by another person's social activity. The Filters apply only
 * to these - never to money/order/system alerts, and never to `new_post`
 * (you explicitly turned the bell on for that person).
 */
export const SOCIAL_TYPES = new Set<NotificationType>([
  'new_follower', 'post_like', 'comment_like', 'post_comment',
  'mention', 'post_repost', 'post_quote',
])

/** Notification types shown in the Mentions tab. */
export const MENTION_TYPES: NotificationType[] = ['mention', 'post_comment']

export const NEW_ACCOUNT_DAYS = 30

/** How far back the "New posts" pane at the top of the page looks. */
export const NEW_POST_WINDOW_HOURS = 24
