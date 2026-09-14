-- ============================================================
-- 017_platform_settings.sql
--
-- Generic key/value settings table for admin-toggleable platform
-- flags. First use: `waitlist_open` — whether the public landing
-- page shows the "join waitlist" form. Like the `waitlist` table
-- itself, this is only ever read/written through the admin client
-- (service role), so no anon/authenticated RLS policies are added —
-- RLS is enabled purely to block accidental exposure if that ever
-- changes.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO platform_settings (key, value)
VALUES ('waitlist_open', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
