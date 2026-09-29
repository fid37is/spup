-- 038_content_rules_and_reports.sql
-- 1) Admin-managed forbidden words/phrases (content_rules) and the review
--    queue their matches land in (content_flags).
-- 2) Makes user reports usable: no duplicate pending reports from one person,
--    and a separate column for reviewer notes (resolving a report used to
--    overwrite the reporter's own "details" text).
-- Safe to re-run.

-- ─── Rules ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_rules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  term        TEXT NOT NULL,
  -- 'word'     = whole word / whole phrase only ("ass" won't hit "class")
  -- 'contains' = anywhere in the text, even inside other words
  match_type  TEXT NOT NULL DEFAULT 'word'  CHECK (match_type IN ('word', 'contains')),
  -- 'flag'  = post publishes, goes to the review queue
  -- 'block' = post is rejected before it publishes (attempt still queued)
  action      TEXT NOT NULL DEFAULT 'flag'  CHECK (action IN ('flag', 'block')),
  category    TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('abuse', 'hate', 'threat', 'scam', 'spam', 'sexual', 'other')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_rules_term ON content_rules (lower(term));

-- ─── Review queue ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_flags (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- the author
  post_id        UUID REFERENCES posts(id) ON DELETE CASCADE,            -- NULL when the post was blocked
  outcome        TEXT NOT NULL CHECK (outcome IN ('published', 'blocked')),
  matched_terms  TEXT[] NOT NULL DEFAULT '{}',
  categories     TEXT[] NOT NULL DEFAULT '{}',
  snippet        TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed', 'actioned')),
  reviewer_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  review_notes   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_flags_pending ON content_flags (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_content_flags_user    ON content_flags (user_id);

-- Server-only tables: RLS on with no policies, so only the service role
-- (the admin client) can read or write them.
ALTER TABLE content_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_flags ENABLE ROW LEVEL SECURITY;

-- ─── Reports ─────────────────────────────────────────────────────────────────
ALTER TABLE reports ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- One pending report per person per thing. (Tidy any duplicates first so the
-- index can be created.)
DELETE FROM reports r USING reports d
 WHERE r.status = 'pending' AND d.status = 'pending'
   AND r.reporter_id = d.reporter_id AND r.entity_type = d.entity_type AND r.entity_id = d.entity_id
   AND r.ctid > d.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_pending_per_reporter
  ON reports (reporter_id, entity_type, entity_id) WHERE status = 'pending';

-- ─── Starter rules (edit freely in the admin panel: Trust & safety → Word rules)
-- Deliberately small and limited to scams/threats - add your own abuse and
-- hate terms there so the list matches what you actually see.
INSERT INTO content_rules (term, match_type, action, category) VALUES
  ('send me your otp',      'word', 'block', 'scam'),
  ('send me your pin',      'word', 'block', 'scam'),
  ('send me your bvn',      'word', 'block', 'scam'),
  ('send me your password', 'word', 'block', 'scam'),
  ('double your money',     'word', 'flag',  'scam'),
  ('guaranteed returns',    'word', 'flag',  'scam'),
  ('kill yourself',         'word', 'block', 'abuse'),
  ('kys',                   'word', 'flag',  'abuse'),
  ('kill you',              'word', 'flag',  'threat')
ON CONFLICT (lower(term)) DO NOTHING;
