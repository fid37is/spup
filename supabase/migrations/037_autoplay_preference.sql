-- 037_autoplay_preference.sql
-- The Autoplay setting ("Always" / "Wi-Fi only" / "Off") is saved through
-- updateProfileAction, but no migration ever created the column, so the save
-- failed and the choice only lived in that one browser. Safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS autoplay_preference TEXT NOT NULL DEFAULT 'wifi';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_autoplay_preference_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_autoplay_preference_check
      CHECK (autoplay_preference IN ('always', 'wifi', 'never'));
  END IF;
END $$;