-- ============================================================
-- 021_profile_fields.sql
--
-- The edit-profile UI (profile-header-edit.tsx) and its server action
-- (updateProfileAction, profiles.ts) already send occupation,
-- date_of_birth, and birthday_visibility on every save — but none of
-- the three ever had a column on `users`. Postgres rejects the UPDATE
-- outright ("column does not exist"), which updateProfileAction
-- swallows into a generic "Failed to update profile." — this is why
-- editing a profile always failed, not just sometimes:
-- birthday_visibility has a non-empty default ('followers') in the
-- form and is sent on literally every save, touched or not, so every
-- single save attempt hit the missing column.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday_visibility TEXT
  NOT NULL DEFAULT 'followers'
  CHECK (birthday_visibility IN ('everyone', 'followers', 'only_me'));