-- ============================================================
-- 051_announcement_reminders.sql
--
-- Lets an announcement come back after someone dismisses it.
-- remind_after_hours = how long a dismissal lasts before the banner is shown
-- again (while the announcement is still live). NULL = a dismissal is final.
-- Typical use: a maintenance notice that re-shows every 6 hours until the
-- window ends. Safe to run more than once.
-- ============================================================

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS remind_after_hours INTEGER
  CHECK (remind_after_hours BETWEEN 1 AND 168);
