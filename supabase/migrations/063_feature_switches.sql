-- ============================================================
-- 063_feature_switches.sql
--
-- Admin-flippable feature switches live in platform_settings (key/value, migration 017).
-- First one: analytics_free_for_all - while true, every user can open /analytics without
-- Spup Premium. Turn it off from admin -> Features once Premium subscriptions are working.
--
-- Running this is optional: lib/feature-flags.ts treats a missing row as "on" for this switch.
-- It just makes the starting value visible in the table.
-- ============================================================

INSERT INTO platform_settings (key, value)
VALUES ('analytics_free_for_all', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
