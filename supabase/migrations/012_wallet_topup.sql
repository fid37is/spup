-- ============================================================
-- 012_wallet_topup.sql
--
-- Prerequisite for escrow payments: today balance_kobo only ever
-- grows from earning_ad / earning_tip / earning_subscription —
-- there is no way for a user to deposit their own money into
-- their own wallet. "Pay a vendor from your wallet" is meaningless
-- until that exists.
--
-- Also fixes a pre-existing gap: src/app/api/promotions/verify
-- inserts transactions with type = 'promotion_spend', but that
-- value was never added to the transaction_type enum. That insert
-- has been silently failing (or was added by hand in the dashboard,
-- outside migration history — worth confirming which). Adding it
-- here alongside wallet_topup since both are additive enum fixes.
-- ============================================================

ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'wallet_topup';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'promotion_spend';
