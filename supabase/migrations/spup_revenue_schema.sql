-- ============================================================
-- SPUP — Ad Revenue Sharing Pipeline
-- Supabase / Postgres schema
-- ============================================================
-- Design principles:
-- 1. Raw impressions are append-only — never mutated, only flagged invalid.
--    This is your audit trail if a creator disputes their earnings.
-- 2. Revenue is attributed per-creator based on ads shown against
--    THEIR content, not pooled — see chat explanation for why.
-- 3. "Estimated" earnings (live, optimistic) are always separate from
--    "confirmed" earnings (post-reconciliation with the ad network).
--    Only confirmed balance is ever withdrawable.
-- 4. Never store a raw BVN. Store only a hash + a verification
--    reference ID from your KYC provider (see fair use policy /
--    verification flow notes below each table). This matters for
--    NDPR (Nigeria Data Protection Regulation) compliance.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Creator identity + KYC
-- ------------------------------------------------------------
create table public.creator_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone_number text unique not null,               -- SIM-registered, second identity anchor
  bvn_hash text unique not null,                    -- hash/token from KYC provider, NEVER raw BVN
  bvn_verification_ref text,                        -- provider's reference ID (Prembly/YouVerify/Smile ID/etc.)
  bank_account_number text not null,
  bank_account_name text not null,                  -- must match KYC name — closes the "different payout account" loophole
  bank_name text not null,
  bank_account_verified boolean default false,
  device_fingerprint text,
  follower_count int default 0,
  earnings_unlocked boolean default false,          -- your 500 followers / 90 days rule
  account_status text default 'active'
    check (account_status in ('active','under_review','suspended','banned')),
  created_at timestamptz default now()
);

-- Enforce one BVN = one account at the DB level, not just at signup validation.
-- (unique constraint on bvn_hash above already does this — reject on insert,
-- don't detect it after the fact)

-- Soft signal for shared-device abuse — flag, don't hard-block, since
-- families/cybercafés legitimately share devices sometimes.
create table public.device_fingerprint_log (
  id uuid primary key default gen_random_uuid(),
  device_fingerprint text not null,
  user_id uuid references auth.users(id),
  created_at timestamptz default now()
);
create index idx_device_fp on public.device_fingerprint_log(device_fingerprint);


-- ------------------------------------------------------------
-- 2. Content + ads
-- ------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references auth.users(id) not null,
  content text,
  created_at timestamptz default now()
);

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  advertiser_name text,
  ad_network text,             -- 'internal', 'google_ad_manager', etc.
  external_ad_id text,         -- ID in the ad network's own system — needed to reconcile
  created_at timestamptz default now()
);


-- ------------------------------------------------------------
-- 3. Impressions — append-only raw event log
-- ------------------------------------------------------------
create table public.ad_impressions (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid references public.ads(id) not null,
  post_id uuid references public.posts(id) not null,
  creator_id uuid references auth.users(id) not null,
  viewer_id uuid references auth.users(id),          -- nullable: anonymous/logged-out viewers
  session_id uuid not null,
  device_fingerprint text,
  ip_address inet,
  dwell_time_ms int not null,                        -- min threshold enforced client + server side
  viewport_pct int,                                   -- % of ad visible on screen
  completion_pct int,                                 -- for video/audio ads
  is_valid boolean default true,                      -- flipped false by the fraud pipeline, never deleted
  created_at timestamptz default now()
);

create index idx_impr_creator_time on public.ad_impressions(creator_id, created_at);
create index idx_impr_viewer_creator on public.ad_impressions(viewer_id, creator_id, created_at);
-- ^ this second index is what your rate-limiter queries: "how many times
--   has this viewer generated an impression for this creator today?"


-- ------------------------------------------------------------
-- 4. Ad network settlement (the actual money, arrives on a lag)
-- ------------------------------------------------------------
create table public.ad_network_settlements (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid references public.ads(id) not null,
  settlement_date date not null,
  gross_revenue numeric(12,2) not null,
  currency text default 'NGN',
  impressions_counted int not null,   -- what the AD NETWORK says was valid — compare vs your own count
  imported_at timestamptz default now(),
  unique(ad_id, settlement_date)
);


-- ------------------------------------------------------------
-- 5. Creator earnings — estimated vs confirmed, kept strictly separate
-- ------------------------------------------------------------
create table public.creator_earnings_daily (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references auth.users(id) not null,
  earning_date date not null,
  estimated_amount numeric(12,2) default 0,   -- live: impressions × historical avg eCPM × 0.70
  confirmed_amount numeric(12,2),             -- null until ad network settlement lands
  status text default 'estimated'
    check (status in ('estimated','confirmed','held','reversed')),
  unique(creator_id, earning_date)
);


-- ------------------------------------------------------------
-- 6. Payouts — only ever drawn from confirmed balance
-- ------------------------------------------------------------
-- Payout cycle: creators may request a withdrawal every 14 days (biweekly),
-- not on demand. Enforce this by checking the creator's last successful
-- payout date before allowing a new request — gives the settlement pipeline
-- time to catch/reverse fraud-flagged earnings before money leaves the platform.
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references auth.users(id) not null,
  amount numeric(12,2) not null,
  bank_account_number text not null,   -- validate this matches creator_profiles.bank_account_number
  status text default 'pending'
    check (status in ('pending','under_review','paid','rejected')),
  requested_at timestamptz default now(),
  paid_at timestamptz
);


-- ------------------------------------------------------------
-- 7. Fraud flags — human-reviewable queue
-- ------------------------------------------------------------
create table public.fraud_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  flag_type text not null,   -- 'duplicate_bvn_attempt' | 'device_cluster' | 'impression_anomaly' | 'self_view'
  details jsonb,
  created_at timestamptz default now(),
  resolved boolean default false
);


-- ============================================================
-- Suggested Row Level Security (enable + adapt per your auth model)
-- ============================================================
-- alter table public.creator_earnings_daily enable row level security;
-- create policy "creators see own earnings"
--   on public.creator_earnings_daily for select
--   using (auth.uid() = creator_id);
--
-- alter table public.ad_impressions enable row level security;
-- (impressions should generally be write-only from a trusted server
--  function/edge function — not directly insertable by the client —
--  to prevent creators from spoofing their own impression counts)
