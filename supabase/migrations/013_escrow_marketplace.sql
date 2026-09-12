-- ============================================================
-- 013_escrow_marketplace.sql
--
-- Peer-to-peer escrow: a buyer pays a vendor (both existing Spup
-- users) from their own wallet balance. The money leaves the
-- buyer's balance_kobo immediately but does NOT enter the
-- seller's balance_kobo until the buyer confirms receipt (or an
-- auto-release timeout passes, or a dispute resolves in the
-- seller's favour). Until then it exists only as an
-- escrow_orders row + an 'escrow_hold' transaction row — never as
-- spendable/withdrawable balance for anyone.
--
-- Disputes are resolved by the two parties negotiating in their
-- existing DM thread and submitting a formal proposal the other
-- side accepts — admin only gets involved if someone explicitly
-- escalates. This keeps Spup out of judgment calls it doesn't
-- need to make, and keeps the ops burden proportional to genuine
-- disagreements rather than every late delivery.
-- ============================================================

-- New transaction types for the escrow ledger. 'escrow_hold' debits
-- the buyer at payment time; 'escrow_release' credits the seller
-- once released. Reversal back to the buyer reuses the existing
-- 'refund' type — it's the same concept (money returned, no goods
-- exchanged), no need for a third value.
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'escrow_hold';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'escrow_release';

-- New notification types so buyers/sellers get pushed at every
-- state change without polling.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'escrow_hold_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'escrow_delivered';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'escrow_released';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'escrow_disputed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'escrow_proposal';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'escrow_escalated';

CREATE TYPE escrow_order_status AS ENUM (
  'held',                 -- buyer paid, funds locked, seller not yet acted
  'delivered_by_seller',  -- seller marked sent/delivered, auto-release timer running
  'released',             -- funds credited to seller (buyer confirmed or auto-release)
  'disputed',             -- either party opened a dispute — auto-release frozen
  'refunded'              -- funds returned to buyer (mutual agreement or admin decision)
);

CREATE TYPE dispute_reason AS ENUM (
  'item_not_received',
  'item_not_as_described',
  'seller_unresponsive',
  'buyer_falsely_disputing',
  'other'
);

CREATE TYPE dispute_status AS ENUM (
  'open',               -- opened, other party hasn't responded/proposed yet
  'negotiating',         -- at least one proposal has been made and rejected/countered
  'resolved_mutual',     -- both parties agreed on a resolution
  'escalated',           -- a party asked Spup to step in
  'resolved_admin'       -- an admin decided
);

CREATE TYPE dispute_evidence_type AS ENUM ('photo', 'video', 'tracking_number', 'note');

CREATE TYPE dispute_resolution_type AS ENUM ('release_to_seller', 'refund_to_buyer', 'split');

CREATE TYPE dispute_proposal_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');

-- Auto-release window: how long after a seller marks delivered
-- before funds release automatically if the buyer does nothing.
-- Protects sellers from buyers going silent to dodge payment.
-- A single constant kept simple deliberately — see notes in
-- lib/actions/escrow.ts if this ever needs to vary by category.
-- (5 days chosen as a reasonable default for in-app P2P handoffs.)

CREATE TABLE escrow_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference           TEXT UNIQUE NOT NULL,          -- e.g. SPUP-ESC-XXXXXXXX
  buyer_id            UUID NOT NULL REFERENCES users(id),
  seller_id           UUID NOT NULL REFERENCES users(id),
  post_id             UUID REFERENCES posts(id),      -- the "for sale" post this payment is against, if any
  amount_kobo         BIGINT NOT NULL CHECK (amount_kobo > 0),
  status              escrow_order_status NOT NULL DEFAULT 'held',
  hold_txn_id         UUID REFERENCES transactions(id),   -- the escrow_hold debit on the buyer
  release_txn_id      UUID REFERENCES transactions(id),   -- the escrow_release credit on the seller (or refund txn)
  note                TEXT,                            -- optional buyer note at payment time ("black hoodie, size M")
  held_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at        TIMESTAMPTZ,
  auto_release_at     TIMESTAMPTZ,                     -- null while held; set on delivered_by_seller; cleared on dispute
  released_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (buyer_id != seller_id)
);

CREATE INDEX idx_escrow_orders_buyer ON escrow_orders(buyer_id);
CREATE INDEX idx_escrow_orders_seller ON escrow_orders(seller_id);
-- Drives the auto-release cron: cheap lookup of exactly the rows due.
CREATE INDEX idx_escrow_orders_auto_release ON escrow_orders(auto_release_at)
  WHERE status = 'delivered_by_seller';

CREATE TABLE escrow_disputes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_order_id     UUID NOT NULL REFERENCES escrow_orders(id) ON DELETE CASCADE,
  opened_by           UUID NOT NULL REFERENCES users(id),
  reason              dispute_reason NOT NULL,
  details             TEXT NOT NULL,
  status              dispute_status NOT NULL DEFAULT 'open',
  resolution          dispute_resolution_type,
  split_seller_kobo   BIGINT CHECK (split_seller_kobo >= 0),
  split_buyer_kobo    BIGINT CHECK (split_buyer_kobo >= 0),
  resolved_by         UUID REFERENCES users(id),        -- admin id, if resolved_admin; the accepting party's id, if resolved_mutual
  resolution_notes    TEXT,
  response_deadline_at TIMESTAMPTZ,                     -- other party should respond by this time
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Only one active dispute per order at a time
  UNIQUE (escrow_order_id)
);

CREATE TABLE escrow_dispute_evidence (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id          UUID NOT NULL REFERENCES escrow_disputes(id) ON DELETE CASCADE,
  uploaded_by         UUID NOT NULL REFERENCES users(id),
  evidence_type       dispute_evidence_type NOT NULL,
  file_url            TEXT,       -- Cloudinary URL for photo/video
  text_content        TEXT,       -- tracking number or free-text note
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (file_url IS NOT NULL OR text_content IS NOT NULL)
);

CREATE INDEX idx_escrow_evidence_dispute ON escrow_dispute_evidence(dispute_id);

CREATE TABLE escrow_dispute_proposals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id          UUID NOT NULL REFERENCES escrow_disputes(id) ON DELETE CASCADE,
  proposed_by         UUID NOT NULL REFERENCES users(id),
  resolution_type     dispute_resolution_type NOT NULL,
  split_seller_kobo   BIGINT CHECK (split_seller_kobo >= 0),
  split_buyer_kobo    BIGINT CHECK (split_buyer_kobo >= 0),
  message             TEXT,        -- optional note shown alongside the proposal card in chat
  status              dispute_proposal_status NOT NULL DEFAULT 'pending',
  responded_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (resolution_type != 'split') OR
    (split_seller_kobo IS NOT NULL AND split_buyer_kobo IS NOT NULL)
  )
);

CREATE INDEX idx_escrow_proposals_dispute ON escrow_dispute_proposals(dispute_id);

-- Keep updated_at fresh (mirrors the pattern used elsewhere in the schema)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_escrow_orders_updated_at
  BEFORE UPDATE ON escrow_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_escrow_disputes_updated_at
  BEFORE UPDATE ON escrow_disputes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE escrow_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_dispute_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_dispute_proposals ENABLE ROW LEVEL SECURITY;

-- Buyer or seller on the order can see it. All writes to
-- escrow_orders go through server actions using the admin client
-- (balance mutations on a wallet that isn't the caller's own
-- require that anyway), so no INSERT/UPDATE policy is defined here
-- — RLS defaults to deny, which is exactly what we want for direct
-- client access to this table.
CREATE POLICY "escrow_orders_parties_read" ON escrow_orders
  FOR SELECT USING (
    buyer_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR seller_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "escrow_disputes_parties_read" ON escrow_disputes
  FOR SELECT USING (
    escrow_order_id IN (
      SELECT id FROM escrow_orders
      WHERE buyer_id = (SELECT id FROM users WHERE auth_id = auth.uid())
         OR seller_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

CREATE POLICY "escrow_evidence_parties_read" ON escrow_dispute_evidence
  FOR SELECT USING (
    dispute_id IN (
      SELECT ed.id FROM escrow_disputes ed
      JOIN escrow_orders eo ON eo.id = ed.escrow_order_id
      WHERE eo.buyer_id = (SELECT id FROM users WHERE auth_id = auth.uid())
         OR eo.seller_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

CREATE POLICY "escrow_proposals_parties_read" ON escrow_dispute_proposals
  FOR SELECT USING (
    dispute_id IN (
      SELECT ed.id FROM escrow_disputes ed
      JOIN escrow_orders eo ON eo.id = ed.escrow_order_id
      WHERE eo.buyer_id = (SELECT id FROM users WHERE auth_id = auth.uid())
         OR eo.seller_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );
