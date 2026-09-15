-- 022_chat_pin_pepper.sql
--
-- chat_pins (bcrypt-hashed 4-digit PIN gating the messages section, see
-- src/components/chat/pin-gate.tsx) had no migration file at all despite
-- being actively used — included here defensively with IF NOT EXISTS so
-- this is safe whether or not it already exists in your database.
--
-- Also adds key_pepper: a server-held, high-entropy secret used together
-- with the PIN to derive the key that wraps a user's E2E chat private key
-- for cross-device recovery (see 021_e2e_key_wrapping.sql and
-- src/lib/chat-crypto.ts). A 4-digit PIN alone is only 10,000
-- combinations — fine for the *online*, rate-limitable bcrypt check this
-- table already does, but nowhere near enough entropy to directly protect
-- an *offline* target like a stored key-wrapping blob (anyone with a DB
-- dump could brute-force 10,000 PINs against it in well under a minute).
-- The pepper is only ever returned by verifyChatPinAction/setChatPinAction
-- AFTER a correct PIN — never stored alongside the wrapped key itself —
-- so a stolen wrapped-key blob is useless without also compromising the
-- live server's PIN check.

CREATE TABLE IF NOT EXISTS chat_pins (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pin_hash    TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_pins
  ADD COLUMN IF NOT EXISTS key_pepper TEXT;  -- base64, random, generated once per user on first PIN creation

COMMENT ON COLUMN chat_pins.key_pepper IS
  'Random 256-bit secret, base64-encoded, mixed with the PIN to derive the key that wraps users.wrapped_private_key. Only ever returned to the client after a correct PIN — see setChatPinAction/verifyChatPinAction in src/lib/actions/messages.ts.';

ALTER TABLE chat_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_pins_own_row ON chat_pins;
CREATE POLICY chat_pins_own_row ON chat_pins
  FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));