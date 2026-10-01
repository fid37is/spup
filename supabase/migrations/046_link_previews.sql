-- Cache of Open Graph cards for links posted in text. Written and read only by the
-- server (service role) - RLS is on with no policies, so clients can't touch it.
CREATE TABLE IF NOT EXISTS link_previews (
  url          TEXT PRIMARY KEY,                 -- the posted link, without its #fragment
  final_url    TEXT,                             -- where it ended up after redirects
  title        TEXT,
  description  TEXT,
  image_url    TEXT,
  site_name    TEXT,
  ok           BOOLEAN NOT NULL DEFAULT false,  -- false = fetched but no usable card / fetch failed
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_link_previews_fetched ON link_previews (fetched_at);
ALTER TABLE link_previews ENABLE ROW LEVEL SECURITY;
