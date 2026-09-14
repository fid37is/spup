-- 015_push_notifications.sql
--
-- user_devices already existed (with fcm_token/platform) but nothing ever
-- populated it in a working way, and nothing ever sent a push using it —
-- the whole feature was receiving-side scaffolding (service worker,
-- Capacitor config) with no sending mechanism at all. This migration makes
-- the table able to hold either kind of registration:
--   - native (Android/iOS via Capacitor): fcm_token
--   - web (browser push, via the existing service worker): a PushSubscription
--     (endpoint + the two keys the browser gives you), since that's not a
--     simple token string the way FCM's is.

ALTER TABLE user_devices
  ALTER COLUMN fcm_token DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS endpoint  TEXT,
  ADD COLUMN IF NOT EXISTS p256dh    TEXT,
  ADD COLUMN IF NOT EXISTS auth_key  TEXT;

-- Exactly one registration shape per row: native rows carry fcm_token and
-- nothing else; web rows carry all three web-push fields and no fcm_token.
ALTER TABLE user_devices
  ADD CONSTRAINT user_devices_registration_shape CHECK (
    (fcm_token IS NOT NULL AND endpoint IS NULL AND p256dh IS NULL AND auth_key IS NULL)
    OR
    (fcm_token IS NULL AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth_key IS NOT NULL)
  );

ALTER TABLE user_devices
  ADD CONSTRAINT user_devices_platform_check CHECK (platform IN ('android', 'ios', 'web'));

-- A browser's push subscription endpoint is its natural unique key (a user
-- re-subscribing in the same browser should update, not duplicate). NULLs
-- in fcm_token/endpoint don't conflict with each other under UNIQUE, so
-- this coexists fine with the existing UNIQUE (user_id, fcm_token).
CREATE UNIQUE INDEX IF NOT EXISTS user_devices_user_endpoint_key
  ON user_devices (user_id, endpoint) WHERE endpoint IS NOT NULL;

COMMENT ON TABLE user_devices IS
  'Push notification registrations — either a native FCM token (Android/iOS via Capacitor) or a Web Push subscription (endpoint+keys, browser/PWA). See lib/push/send.ts for the actual sending logic.';
