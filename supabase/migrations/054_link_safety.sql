-- 053_link_safety.sql
-- Link safety: every external link in a post, reply, quote, bio, website field or DM
-- is checked, then stored here and shown as a short link (spup.live/l/xK3p9) that opens
-- an interstitial before leaving Spup. Changing a row's status instantly changes what
-- every past post and message pointing at it does - no text edits needed.
-- All tables are server-only: RLS on with no policies, so only the service role (the
-- admin client) reads or writes them. Safe to re-run.

-- ─── links ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS links (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            VARCHAR(12)  NOT NULL,                 -- short code, e.g. xK3p9Aq
  original_url    TEXT         NOT NULL,                 -- as first submitted
  normalized_url  TEXT         NOT NULL,                 -- canonical form (one row per URL)
  resolved_url    TEXT         NOT NULL,                 -- final destination after expanding shorteners
  domain          VARCHAR(255) NOT NULL,                 -- host of resolved_url, without "www."
  safety_status   TEXT         NOT NULL CHECK (safety_status IN ('safe', 'unknown', 'blocked')),
  block_reason    VARCHAR(255),                          -- internal audit trail for blocks
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  click_count     INTEGER      NOT NULL DEFAULT 0,
  report_count    INTEGER      NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_links_slug       ON links (slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_links_normalized ON links (normalized_url);
CREATE INDEX        IF NOT EXISTS idx_links_domain    ON links (domain);
-- The periodic re-scan walks the oldest-checked links that are not already blocked.
CREATE INDEX        IF NOT EXISTS idx_links_recheck   ON links (last_checked_at) WHERE safety_status <> 'blocked';
ALTER TABLE links ENABLE ROW LEVEL SECURITY;

-- ─── local threat lists (OpenPhish, URLhaus, plus anything you add by hand) ───
CREATE TABLE IF NOT EXISTS link_blocklist (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind       TEXT NOT NULL CHECK (kind IN ('url', 'domain')),  -- 'url' = that exact page, 'domain' = the whole site
  value      TEXT NOT NULL,
  source     TEXT NOT NULL,                                    -- 'openphish' | 'urlhaus' | 'manual' | ...
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),               -- feed imports refresh this; stale rows are removed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_link_blocklist_kind_value ON link_blocklist (kind, value);
CREATE INDEX        IF NOT EXISTS idx_link_blocklist_value     ON link_blocklist (value);
CREATE INDEX        IF NOT EXISTS idx_link_blocklist_source    ON link_blocklist (source, last_seen);
ALTER TABLE link_blocklist ENABLE ROW LEVEL SECURITY;

-- ─── domain age cache (so a domain is looked up once, not on every post) ──────
CREATE TABLE IF NOT EXISTS link_domain_age (
  domain        TEXT PRIMARY KEY,             -- registered domain, e.g. example.com / example.com.ng
  registered_at TIMESTAMPTZ,                  -- NULL = the registry did not tell us
  source        TEXT NOT NULL,                -- 'rdap' | 'whoisxml'
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE link_domain_age ENABLE ROW LEVEL SECURITY;

-- ─── strikes: every time someone tries to share a blocked link ────────────────
CREATE TABLE IF NOT EXISTS link_strikes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  link_id    UUID REFERENCES links(id) ON DELETE SET NULL,
  url        TEXT NOT NULL,
  reason     TEXT NOT NULL,
  context    TEXT NOT NULL CHECK (context IN ('post', 'reply', 'quote', 'bio', 'website', 'dm')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_link_strikes_user ON link_strikes (user_id, created_at DESC);
ALTER TABLE link_strikes ENABLE ROW LEVEL SECURITY;

-- ─── reports: "Report this link" on the interstitial ──────────────────────────
CREATE TABLE IF NOT EXISTS link_reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  link_id     UUID NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (link_id, reporter_id)                -- one report per person per link
);
ALTER TABLE link_reports ENABLE ROW LEVEL SECURITY;

-- ─── posts: which posts have already had their links checked (for the backfill) ─
ALTER TABLE posts ADD COLUMN IF NOT EXISTS links_scanned_at TIMESTAMPTZ;

-- ─── helpers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bump_link_click(p_link UUID) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE links SET click_count = click_count + 1 WHERE id = p_link;
$$;
REVOKE ALL ON FUNCTION bump_link_click(UUID) FROM PUBLIC, anon, authenticated;

-- Moderator tools (run in the Supabase SQL editor; they are not callable from the app):
--   SELECT block_link_domain('evil-site.com', 'reported: fake Opay KYC page');
--   SELECT unblock_link_domain('wrongly-blocked.com');
-- Blocking a domain flips every existing link on it to 'blocked' (so every past post
-- stops working at once) and adds it to the local blocklist so it cannot be shared again.
CREATE OR REPLACE FUNCTION block_link_domain(p_domain TEXT, p_reason TEXT) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  p_domain := lower(regexp_replace(trim(p_domain), '^www\.', ''));
  INSERT INTO link_blocklist (kind, value, source)
    VALUES ('domain', p_domain, 'manual')
    ON CONFLICT (kind, value) DO UPDATE SET last_seen = NOW(), source = 'manual';
  UPDATE links SET safety_status = 'blocked', block_reason = left('manual: ' || p_reason, 255), last_checked_at = NOW()
   WHERE domain = p_domain OR domain LIKE '%.' || p_domain;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION block_link_domain(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION unblock_link_domain(p_domain TEXT) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  p_domain := lower(regexp_replace(trim(p_domain), '^www\.', ''));
  DELETE FROM link_blocklist WHERE kind = 'domain' AND value = p_domain;
  -- 'unknown', not 'safe': the next re-scan decides properly.
  UPDATE links SET safety_status = 'unknown', block_reason = NULL, last_checked_at = '1970-01-01'
   WHERE (domain = p_domain OR domain LIKE '%.' || p_domain) AND safety_status = 'blocked';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION unblock_link_domain(TEXT) FROM PUBLIC, anon, authenticated;
