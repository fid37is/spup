-- ============================================================
-- 050_announcements.sql
--
-- Admin-authored announcement banners shown at the top of the feed
-- (new features, maintenance heads-ups). Created and ended from the
-- admin console (src/app/(admin)/announcements); displayed by
-- src/components/feed/announcement-banner.tsx.
--
-- A banner is "live" when is_active AND starts_at <= now() AND
-- (ends_at IS NULL OR ends_at > now()). Ending one early just sets
-- is_active = false, so the row stays as history.
--
-- RLS: signed-in users can read ONLY live rows (that is all the feed
-- needs). There are no write policies, so every insert/update goes
-- through the admin (service-role) client in
-- src/lib/actions/announcements.ts, which checks the caller is an
-- admin first - same approach as promo_codes (032).
--
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('feature', 'maintenance')),
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 60),
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 200),
  cta_label   TEXT CHECK (char_length(cta_label) BETWEEN 1 AND 24),
  cta_url     TEXT CHECK (char_length(cta_url) <= 500),
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at     TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A button needs both its label and its link, or neither.
  CONSTRAINT announcement_cta_pair CHECK ((cta_label IS NULL) = (cta_url IS NULL)),
  CONSTRAINT announcement_window CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_announcements_live ON announcements (is_active, starts_at, ends_at);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_read_live" ON announcements;
CREATE POLICY "announcements_read_live" ON announcements
  FOR SELECT TO authenticated
  USING (is_active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()));
