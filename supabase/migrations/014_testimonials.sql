-- ============================================================
-- 014_testimonials.sql
-- Backs the landing page testimonials section. Submissions land
-- as 'pending' and only 'approved' rows are ever shown publicly.
-- Reads/writes go through the service-role (admin) client from
-- server actions — no anon RLS policies needed since visitors
-- never query this table directly from the browser.
-- ============================================================

CREATE TABLE IF NOT EXISTS testimonials (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  handle        TEXT,              -- e.g. "@chioma_creates" — optional
  location      TEXT,              -- e.g. "Lagos" — optional
  quote         TEXT NOT NULL,
  earned_label  TEXT,              -- e.g. "₦45K / mo" — optional highlight badge
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_testimonials_status ON testimonials (status, created_at DESC);

ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
-- No policies added — locked down by default, service-role client bypasses
-- RLS entirely, which is how both submission and display are handled.
