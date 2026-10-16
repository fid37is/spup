-- ============================================================
-- 057_escrow_fee.sql
--
-- Escrow fee: a percentage of the order, paid by the BUYER on top of the order
-- amount. The vendor still receives the full order amount on release. If an
-- order is refunded, the buyer gets the order amount back and Spup keeps the fee.
--
-- escrow_fee_bps is in basis points: 500 = 5%, 250 = 2.5%.
-- Change any time, no deploy:
--   UPDATE platform_settings SET value = '300'::jsonb, updated_at = NOW()
--    WHERE key = 'escrow_fee_bps';
--
-- The fee is recorded on the order (escrow_orders.fee_kobo) and on the
-- buyer's escrow_hold transaction (transactions.platform_fee_kobo), so
-- finance can total it with: SELECT SUM(fee_kobo) FROM escrow_orders;
-- ============================================================

ALTER TABLE escrow_orders ADD COLUMN IF NOT EXISTS fee_kobo BIGINT NOT NULL DEFAULT 0;

INSERT INTO platform_settings (key, value)
VALUES ('escrow_fee_bps', '500'::jsonb)
ON CONFLICT (key) DO NOTHING;
