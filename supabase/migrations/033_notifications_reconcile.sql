-- 033_notifications_reconcile.sql
--
-- Three things the Notifications page depends on that no earlier migration
-- guarantees. Everything here is idempotent and a no-op where the database
-- already has it, so it is safe to run on any environment.
--
--   1. 'new_message' notification type. The app filters on it
--      (.neq('type', 'new_message') in the notifications list and the unread
--      badge) and inserts it, but no migration ever added it to the enum. If
--      the enum lacks it, Postgres rejects those queries outright and the page
--      shows an empty list / a zero badge instead of an error.
--   2. The actor foreign key must be named notifications_actor_id_fkey: the
--      list query embeds the actor with users!notifications_actor_id_fkey. If
--      the constraint was created under another name, PostgREST returns
--      "could not find a relationship" and the whole query fails.
--   3. `notifications` in the supabase_realtime publication. The page
--      subscribes to postgres_changes INSERT on it; without the publication
--      entry that subscription never fires and new notifications only appear
--      after a manual refresh.

-- 1 ─────────────────────────────────────────────────────────────────────────
-- (A new enum value can't be used in the same transaction that adds it.
-- Nothing in this file uses it, so this is safe to run as one script.)
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_message';

-- 2 ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  fk_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND conname = 'notifications_actor_id_fkey'
  ) THEN
    SELECT c.conname INTO fk_name
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.notifications'::regclass
      AND c.confrelid = 'public.users'::regclass
      AND c.contype = 'f'
      AND a.attname = 'actor_id'
    LIMIT 1;

    IF fk_name IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.notifications RENAME CONSTRAINT %I TO notifications_actor_id_fkey',
        fk_name
      );
    END IF;
  END IF;
END $$;

-- 3 ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
