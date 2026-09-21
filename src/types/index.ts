import type { LucideIcon } from 'lucide-react'

import {
  Dumbbell,
  Music2,
  Clapperboard,
  Landmark,
  Briefcase,
  Laptop,
  Shirt,
  Utensils,
  Laugh,
  Bitcoin,
  BookOpen,
  HeartPulse,
  Gamepad2,
  Plane,
  HandHeart,
  Palette,
} from 'lucide-react'

// ─── Database Enums ────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'creator' | 'moderator' | 'admin'

export type AccountStatus =
  | 'active'
  | 'suspended'
  | 'banned'
  | 'pending_verification'

export type NotificationType =
  | 'new_follower'
  | 'post_like'
  | 'post_comment'
  | 'post_repost'
  | 'post_quote'
  | 'comment_like'
  | 'mention'
  | 'new_post'
  | 'tip_received'
  | 'subscription_new'
  | 'earning_milestone'
  | 'monetisation_approved'
  | 'system'
  | 'new_message'
  | 'escrow_hold_received'
  | 'escrow_delivered'
  | 'escrow_released'
  | 'escrow_disputed'
  | 'escrow_proposal'
  | 'escrow_escalated'

export type PostType = 'original' | 'repost' | 'quote' | 'reply'

export type MediaType = 'image' | 'video' | 'audio' | 'gif'

export type TransactionType =
  | 'earning_ad'
  | 'earning_tip'
  | 'earning_subscription'
  | 'withdrawal'
  | 'refund'
  | 'wallet_topup'
  | 'escrow_hold'
  | 'escrow_release'
  | 'promotion_spend'
  | 'transfer_sent'
  | 'transfer_received'

export type TransactionStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'reversed'

export type VerificationTier =
  | 'none'
  | 'standard'
  | 'pioneer'
  | 'creator'
  | 'organisation'
  | 'spup'

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'misinformation'
  | 'nudity'
  | 'violence'
  | 'other'

export type ReportStatus =
  | 'pending'
  | 'reviewed'
  | 'actioned'
  | 'dismissed'

// ─── Database Row Types ────────────────────────────────────────────────────────

export interface User {
  id: string
  auth_id: string
  username: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  banner_url: string | null
  website_url: string | null
  location: string | null
  phone_number: string | null
  email: string | null
  role: UserRole
  status: AccountStatus
  verification_tier: VerificationTier
  is_private: boolean
  is_monetised: boolean
  monetised_at: string | null
  is_pioneer: boolean
  phone_verified: boolean
  bvn_verified: boolean
  nin_verified: boolean
  followers_count: number
  following_count: number
  posts_count: number
  language_preference: string
  created_at: string
  updated_at: string
  last_active_at: string | null
  deleted_at: string | null
}

export interface Post {
  id: string
  user_id: string
  body: string | null
  post_type: PostType
  parent_post_id: string | null
  quoted_post_id: string | null
  likes_count: number
  comments_count: number
  reposts_count: number
  quotes_count: number
  bookmarks_count: number
  impressions_count: number
  is_pinned: boolean
  is_selling: boolean
  is_sensitive: boolean
  language: string
  location: string | null
  created_at: string
  updated_at: string
  edited_at: string | null
  deleted_at: string | null

  // Joined
  author?: User
  media?: PostMedia[]
  is_liked?: boolean
  is_reposted?: boolean
  is_bookmarked?: boolean
  quoted_post?: Post | null
}

export interface PostMedia {
  id: string
  post_id: string
  media_type: MediaType
  url: string
  thumbnail_url: string | null
  width: number | null
  height: number | null
  duration_secs: number | null
  size_bytes: number | null
  alt_text: string | null
  position: number
  created_at: string
}

export interface Follow {
  id: string
  follower_id: string
  following_id: string
  created_at: string
}

export interface Notification {
  id: string
  recipient_id: string
  actor_id: string | null
  type: NotificationType
  entity_id: string | null
  entity_type: string | null
  metadata: Record<string, unknown>
  is_read: boolean
  created_at: string
  actor?: User
}

export interface Wallet {
  id: string
  user_id: string
  balance_kobo: number
  total_earned_kobo: number
  total_withdrawn_kobo: number
  paystack_recipient_code: string | null
  bank_name: string | null
  bank_account_number: string | null
  bank_account_name: string | null
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  wallet_id: string
  type: TransactionType
  amount_kobo: number
  platform_fee_kobo: number
  status: TransactionStatus
  reference: string | null
  description: string | null
  metadata: Record<string, unknown>
  entity_id: string | null
  created_at: string
  completed_at: string | null
}

// ─── UI Component Types ────────────────────────────────────────────────────────

export interface Interest {
  id: string
  label: string
  icon: LucideIcon
  category: string
}

export const NIGERIAN_INTERESTS: Interest[] = [
  {
    id: 'football',
    label: 'Football',
    icon: Dumbbell,
    category: 'Sports',
  },
  {
    id: 'naija_music',
    label: 'Afrobeats',
    icon: Music2,
    category: 'Entertainment',
  },
  {
    id: 'nollywood',
    label: 'Nollywood',
    icon: Clapperboard,
    category: 'Entertainment',
  },
  {
    id: 'politics',
    label: 'Politics',
    icon: Landmark,
    category: 'News',
  },
  {
    id: 'business',
    label: 'Business',
    icon: Briefcase,
    category: 'Career',
  },
  {
    id: 'tech',
    label: 'Tech',
    icon: Laptop,
    category: 'Career',
  },
  {
    id: 'fashion',
    label: 'Fashion',
    icon: Shirt,
    category: 'Lifestyle',
  },
  {
    id: 'food',
    label: 'Nigerian Food',
    icon: Utensils,
    category: 'Lifestyle',
  },
  {
    id: 'comedy',
    label: 'Comedy',
    icon: Laugh,
    category: 'Entertainment',
  },
  {
    id: 'crypto',
    label: 'Crypto',
    icon: Bitcoin,
    category: 'Finance',
  },
  {
    id: 'education',
    label: 'Education',
    icon: BookOpen,
    category: 'Career',
  },
  {
    id: 'health',
    label: 'Health & Fitness',
    icon: HeartPulse,
    category: 'Lifestyle',
  },
  {
    id: 'gaming',
    label: 'Gaming',
    icon: Gamepad2,
    category: 'Entertainment',
  },
  {
    id: 'travel',
    label: 'Travel',
    icon: Plane,
    category: 'Lifestyle',
  },
  {
    id: 'spirituality',
    label: 'Faith & Spirituality',
    icon: HandHeart,
    category: 'Lifestyle',
  },
  {
    id: 'art',
    label: 'Art & Design',
    icon: Palette,
    category: 'Creative',
  },
]

// ─── Window Extensions ─────────────────────────────────────────────────────────

// Extend Window with Google AdSense global
declare global {
  interface Window {
    adsbygoogle: unknown[]
  }
}