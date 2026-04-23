# Spup — Nigerian Social Platform

## Architecture

```
src/
├── app/                          # UI only — pages & layouts
│   ├── (auth)/                   # login, signup, verify-otp, onboarding, forgot-password
│   ├── (main)/                   # feed, profile, notifications, wallet, explore, settings
│   │   └── post/[id]/            # post detail + replies
│   ├── api/                      # REST endpoints (webhooks + media upload only)
│   │   ├── upload/               # Cloudinary media upload
│   │   └── paystack/             # webhook + withdrawal initiation
│   └── offline/                  # PWA offline fallback
├── components/
│   ├── auth/                     # FormField, AuthCard, Alert, SubmitButton
│   ├── feed/                     # PostCard, PostComposer, PostModal, MediaGrid
│   └── layout/                   # SidebarNav, RightSidebar, PWAProvider
├── hooks/
│   ├── use-media-upload.ts       # Cloudinary upload with optimistic preview
│   ├── use-push-notifications.ts # FCM registration (Capacitor)
│   └── use-pwa.ts                # Service worker registration
├── lib/
│   ├── supabase/                 # client.ts, server.ts, index.ts (barrel)
│   ├── actions/                  # Server Actions — one file per domain
│   │   ├── auth.ts               # signup, login, OTP, onboarding
│   │   ├── posts.ts              # createPost, like, repost, bookmark, delete
│   │   ├── follows.ts            # follow, unfollow, block, mute
│   │   ├── notifications.ts      # markRead, markAllRead, delete
│   │   ├── profiles.ts           # updateProfile, avatar, banner, username, deleteAccount
│   │   ├── feed.ts               # getForYouFeed, getFollowingFeed, getReplies (paginated)
│   │   └── index.ts              # barrel — import anything from '@/lib/actions'
│   ├── queries/                  # Pure reads — no auth, no mutations
│   │   ├── posts.ts              # getPostById, getUserPosts, searchPosts
│   │   ├── users.ts              # getProfileByUsername, getFollowers, searchUsers
│   │   ├── notifications.ts      # getNotifications, getUnreadCount
│   │   ├── wallet.ts             # getWallet, getTransactions, checkEligibility
│   │   └── index.ts              # barrel — import anything from '@/lib/queries'
│   ├── validations/schemas.ts    # Zod schemas (Nigerian phone, password, etc.)
│   └── utils/index.ts            # formatNaira, formatRelativeTime, etc.
├── middleware.ts                  # Auth route protection
└── types/index.ts                 # All TypeScript interfaces + Nigerian interests
```

## Quick Start

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase, Paystack, Cloudinary, Firebase
# Run supabase/migrations/001_initial_schema.sql in Supabase SQL editor
npm run dev
```

## Mobile (Capacitor)

```bash
npm run build       # build Next.js
npx cap sync        # copy web assets to native
npx cap open android  # open Android Studio
npx cap open ios      # open Xcode
```

## Key rules

- **`app/`** only imports from `@/lib/queries` (reads) and `@/lib/actions` (writes)  
- **`lib/queries/`** — pure reads, no `'use server'`, no mutations  
- **`lib/actions/`** — all have `'use server'`, one domain per file  
- **`app/api/`** — only for webhooks (Paystack) and file upload (Cloudinary)  
- Server Actions are used for mobile (Capacitor) too — no separate REST layer needed
