-- ============================================================
-- Para Platform — Complete Database Schema
-- Migration: 001_initial_schema.sql
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- Full-text search
CREATE EXTENSION IF NOT EXISTS "unaccent";       -- Accent-insensitive search

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('user', 'creator', 'moderator', 'admin');
CREATE TYPE account_status AS ENUM ('active', 'suspended', 'banned', 'pending_verification');
CREATE TYPE notification_type AS ENUM (
  'new_follower', 'post_like', 'post_comment', 'post_repost',
  'comment_like', 'mention', 'tip_received', 'subscription_new',
  'earning_milestone', 'monetisation_approved', 'system'
);
CREATE TYPE post_type AS ENUM ('original', 'repost', 'quote', 'reply');
CREATE TYPE media_type AS ENUM ('image', 'video', 'audio', 'gif');
CREATE TYPE transaction_type AS ENUM ('earning_ad', 'earning_tip', 'earning_subscription', 'withdrawal', 'refund');
CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed', 'reversed');
CREATE TYPE verification_tier AS ENUM ('none', 'standard', 'creator', 'organisation');
CREATE TYPE report_reason AS ENUM ('spam', 'harassment', 'hate_speech', 'misinformation', 'nudity', 'violence', 'other');
CREATE TYPE report_status AS ENUM ('pending', 'reviewed', 'actioned', 'dismissed');

-- ─── USERS ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id             UUID UNIQUE NOT NULL,         -- Supabase auth.users.id
  username            TEXT UNIQUE NOT NULL,
  display_name        TEXT NOT NULL,
  bio                 TEXT,
  avatar_url          TEXT,
  banner_url          TEXT,
  website_url         TEXT,
  location            TEXT,
  phone_number        TEXT UNIQUE,                  -- Nigerian number, E.164 format
  email               TEXT UNIQUE,
  role                user_role NOT NULL DEFAULT 'user',
  status              account_status NOT NULL DEFAULT 'active',
  verification_tier   verification_tier NOT NULL DEFAULT 'none',
  is_private          BOOLEAN NOT NULL DEFAULT false,
  is_monetised        BOOLEAN NOT NULL DEFAULT false,
  bvn_verified        BOOLEAN NOT NULL DEFAULT false,
  followers_count     INTEGER NOT NULL DEFAULT 0 CHECK (followers_count >= 0),
  following_count     INTEGER NOT NULL DEFAULT 0 CHECK (following_count >= 0),
  posts_count         INTEGER NOT NULL DEFAULT 0 CHECK (posts_count >= 0),
  language_preference TEXT NOT NULL DEFAULT 'en',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at      TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ                   -- Soft delete
);

CREATE INDEX idx_users_username ON users USING btree (username);
CREATE INDEX idx_users_auth_id ON users USING btree (auth_id);
CREATE INDEX idx_users_phone ON users USING btree (phone_number);
CREATE INDEX idx_users_search ON users USING gin (
  to_tsvector('english', coalesce(username, '') || ' ' || coalesce(display_name, '') || ' ' || coalesce(bio, ''))
);

-- ─── FOLLOWS ─────────────────────────────────────────────────────────────────

CREATE TABLE follows (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id != following_id)             -- Cannot follow yourself
);

CREATE INDEX idx_follows_follower ON follows (follower_id);
CREATE INDEX idx_follows_following ON follows (following_id);

-- ─── POSTS ────────────────────────────────────────────────────────────────────

CREATE TABLE posts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body              TEXT,
  post_type         post_type NOT NULL DEFAULT 'original',
  parent_post_id    UUID REFERENCES posts(id) ON DELETE SET NULL,  -- For replies
  quoted_post_id    UUID REFERENCES posts(id) ON DELETE SET NULL,  -- For quote posts
  likes_count       INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  comments_count    INTEGER NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
  reposts_count     INTEGER NOT NULL DEFAULT 0 CHECK (reposts_count >= 0),
  quotes_count      INTEGER NOT NULL DEFAULT 0 CHECK (quotes_count >= 0),
  bookmarks_count   INTEGER NOT NULL DEFAULT 0 CHECK (bookmarks_count >= 0),
  impressions_count BIGINT NOT NULL DEFAULT 0 CHECK (impressions_count >= 0),
  is_pinned         BOOLEAN NOT NULL DEFAULT false,
  is_sensitive      BOOLEAN NOT NULL DEFAULT false,
  language          TEXT NOT NULL DEFAULT 'en',
  location          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at         TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,                   -- Soft delete
  CONSTRAINT post_has_content CHECK (
    body IS NOT NULL OR post_type = 'repost'
  ),
  CONSTRAINT body_length CHECK (char_length(body) <= 500)
);

CREATE INDEX idx_posts_user_id ON posts (user_id, created_at DESC);
CREATE INDEX idx_posts_parent ON posts (parent_post_id);
CREATE INDEX idx_posts_created ON posts (created_at DESC);
CREATE INDEX idx_posts_deleted ON posts (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_posts_search ON posts USING gin (
  to_tsvector('english', coalesce(body, ''))
) WHERE deleted_at IS NULL;

-- ─── POST MEDIA ───────────────────────────────────────────────────────────────

CREATE TABLE post_media (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id         UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_type      media_type NOT NULL,
  url             TEXT NOT NULL,
  thumbnail_url   TEXT,
  width           INTEGER,
  height          INTEGER,
  duration_secs   INTEGER,                          -- For video/audio
  size_bytes      BIGINT,
  alt_text        TEXT,
  position        SMALLINT NOT NULL DEFAULT 0,      -- Order in post
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_media_post ON post_media (post_id);

-- ─── HASHTAGS ─────────────────────────────────────────────────────────────────

CREATE TABLE hashtags (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tag           TEXT UNIQUE NOT NULL,               -- Lowercase, no #
  posts_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hashtags_tag ON hashtags USING btree (tag);
CREATE INDEX idx_hashtags_trending ON hashtags (posts_count DESC);

CREATE TABLE post_hashtags (
  post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtag_id  UUID NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, hashtag_id)
);

CREATE INDEX idx_post_hashtags_hashtag ON post_hashtags (hashtag_id);

-- ─── MENTIONS ────────────────────────────────────────────────────────────────

CREATE TABLE post_mentions (
  post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

-- ─── LIKES ───────────────────────────────────────────────────────────────────

CREATE TABLE likes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX idx_likes_post ON likes (post_id);
CREATE INDEX idx_likes_user ON likes (user_id);

-- ─── BOOKMARKS ───────────────────────────────────────────────────────────────

CREATE TABLE bookmarks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX idx_bookmarks_user ON bookmarks (user_id, created_at DESC);

-- ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  type            notification_type NOT NULL,
  entity_id       UUID,                             -- ID of the related entity (post, user, etc.)
  entity_type     TEXT,                             -- 'post' | 'user' | 'comment' | 'transaction'
  metadata        JSONB DEFAULT '{}',               -- Flexible additional data
  is_read         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications (recipient_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (recipient_id, is_read) WHERE is_read = false;

-- ─── WALLETS & TRANSACTIONS ──────────────────────────────────────────────────

CREATE TABLE wallets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_kobo      BIGINT NOT NULL DEFAULT 0 CHECK (balance_kobo >= 0), -- Store in kobo (1 NGN = 100 kobo)
  total_earned_kobo BIGINT NOT NULL DEFAULT 0,
  total_withdrawn_kobo BIGINT NOT NULL DEFAULT 0,
  paystack_recipient_code TEXT,                     -- For automated payouts
  bank_name         TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id         UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  type              transaction_type NOT NULL,
  amount_kobo       BIGINT NOT NULL CHECK (amount_kobo > 0),
  platform_fee_kobo BIGINT NOT NULL DEFAULT 0,
  status            transaction_status NOT NULL DEFAULT 'pending',
  reference         TEXT UNIQUE,                    -- Paystack reference
  description       TEXT,
  metadata          JSONB DEFAULT '{}',
  entity_id         UUID,                           -- Related post, tip, etc.
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX idx_transactions_wallet ON transactions (wallet_id, created_at DESC);
CREATE INDEX idx_transactions_status ON transactions (status) WHERE status = 'pending';
CREATE INDEX idx_transactions_reference ON transactions (reference);

-- ─── BLOCKS & MUTES ──────────────────────────────────────────────────────────

CREATE TABLE user_blocks (
  blocker_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE TABLE user_mutes (
  muter_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (muter_id, muted_id),
  CHECK (muter_id != muted_id)
);

-- ─── FOLLOW REQUESTS (for private accounts) ──────────────────────────────────

CREATE TABLE follow_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester_id, target_id)
);

-- ─── USER DEVICES (push notifications) ───────────────────────────────────────

CREATE TABLE user_devices (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token   TEXT NOT NULL,
  platform    TEXT NOT NULL DEFAULT 'android',     -- android | ios | web
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fcm_token)
);

-- ─── REPORTS ─────────────────────────────────────────────────────────────────

CREATE TABLE reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL,
  entity_type     TEXT NOT NULL,                    -- 'post' | 'user' | 'comment'
  reason          report_reason NOT NULL,
  details         TEXT,
  status          report_status NOT NULL DEFAULT 'pending',
  reviewer_id     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_status ON reports (status) WHERE status = 'pending';

-- ─── ONBOARDING ──────────────────────────────────────────────────────────────

CREATE TABLE user_interests (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interest    TEXT NOT NULL,
  PRIMARY KEY (user_id, interest)
);

CREATE TABLE onboarding_progress (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  step              INTEGER NOT NULL DEFAULT 0,
  profile_complete  BOOLEAN NOT NULL DEFAULT false,
  interests_set     BOOLEAN NOT NULL DEFAULT false,
  first_follow      BOOLEAN NOT NULL DEFAULT false,
  completed_at      TIMESTAMPTZ
);

-- ─── MONETISATION ELIGIBILITY ────────────────────────────────────────────────

CREATE TABLE monetisation_applications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  followers_at_apply INTEGER,
  posts_at_apply  INTEGER,
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── FUNCTIONS ────────────────────────────────────────────────────────────────

-- Safe counter increment (avoids race conditions)
CREATE OR REPLACE FUNCTION increment_counter(
  p_table TEXT, p_column TEXT, p_id UUID, p_amount INTEGER DEFAULT 1
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  EXECUTE format(
    'UPDATE %I SET %I = GREATEST(0, %I + $1), updated_at = NOW() WHERE id = $2',
    p_table, p_column, p_column
  ) USING p_amount, p_id;
END;
$$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Extract and upsert hashtags from post body
CREATE OR REPLACE FUNCTION process_post_hashtags(p_post_id UUID, p_body TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tag TEXT;
  v_hashtag_id UUID;
BEGIN
  -- Delete old hashtag associations
  DELETE FROM post_hashtags WHERE post_id = p_post_id;

  -- Parse and insert new ones
  FOR v_tag IN
    SELECT DISTINCT lower(m[1])
    FROM regexp_matches(p_body, '#([A-Za-z0-9_]+)', 'g') AS m
  LOOP
    INSERT INTO hashtags (tag) VALUES (v_tag)
    ON CONFLICT (tag) DO UPDATE SET posts_count = hashtags.posts_count + 1
    RETURNING id INTO v_hashtag_id;

    INSERT INTO post_hashtags (post_id, hashtag_id) VALUES (p_post_id, v_hashtag_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- ─── TRIGGERS ────────────────────────────────────────────────────────────────

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create wallet when user is created
CREATE OR REPLACE FUNCTION create_user_wallet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO wallets (user_id) VALUES (NEW.id);
  INSERT INTO onboarding_progress (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_wallet_on_signup
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION create_user_wallet();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_requests ENABLE ROW LEVEL SECURITY;

-- USERS policies
CREATE POLICY "users_public_read" ON users
  FOR SELECT USING (deleted_at IS NULL AND status != 'banned');

CREATE POLICY "users_own_update" ON users
  FOR UPDATE USING (auth_id = auth.uid());

-- POSTS policies
CREATE POLICY "posts_public_read" ON posts
  FOR SELECT USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = posts.user_id
        AND u.deleted_at IS NULL
        AND u.status != 'banned'
        AND (
          u.is_private = false
          OR u.auth_id = auth.uid()
          OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = (SELECT id FROM users WHERE auth_id = auth.uid()) AND f.following_id = u.id)
        )
    )
  );

CREATE POLICY "posts_own_insert" ON posts
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "posts_own_update" ON posts
  FOR UPDATE USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "posts_own_delete" ON posts
  FOR DELETE USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- FOLLOWS policies
CREATE POLICY "follows_public_read" ON follows FOR SELECT USING (true);

CREATE POLICY "follows_own_insert" ON follows
  FOR INSERT WITH CHECK (
    follower_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "follows_own_delete" ON follows
  FOR DELETE USING (
    follower_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- LIKES policies
CREATE POLICY "likes_public_read" ON likes FOR SELECT USING (true);

CREATE POLICY "likes_own_insert" ON likes
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "likes_own_delete" ON likes
  FOR DELETE USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- BOOKMARKS policies (private — only owner sees)
CREATE POLICY "bookmarks_own" ON bookmarks
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- NOTIFICATIONS policies (private)
CREATE POLICY "notifications_own" ON notifications
  USING (recipient_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- WALLETS policies (private)
CREATE POLICY "wallets_own" ON wallets
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- TRANSACTIONS policies (private)
CREATE POLICY "transactions_own" ON transactions
  USING (
    wallet_id IN (SELECT id FROM wallets WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  );

-- USER_BLOCKS policies
CREATE POLICY "blocks_own" ON user_blocks
  USING (blocker_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- USER_MUTES policies
CREATE POLICY "mutes_own" ON user_mutes
  USING (muter_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- USER_DEVICES policies
CREATE POLICY "devices_own" ON user_devices
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- REPORTS policies
CREATE POLICY "reports_own_insert" ON reports
  FOR INSERT WITH CHECK (
    reporter_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "reports_own_read" ON reports
  FOR SELECT USING (
    reporter_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- USER_INTERESTS policies
CREATE POLICY "interests_own" ON user_interests
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ONBOARDING_PROGRESS policies
CREATE POLICY "onboarding_own" ON onboarding_progress
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- FOLLOW_REQUESTS policies
CREATE POLICY "follow_requests_own" ON follow_requests
  USING (
    requester_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR target_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );
