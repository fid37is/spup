# Post promotion: redeemable promo codes (no Paystack needed)

## The problem

`PAYSTACK_SECRET_KEY` isn't set in this environment, so every "Promote post" attempt calls Paystack with an
invalid key and gets rejected - "Could not initialize payment." Promotion doesn't work for anyone until
that's configured.

## What this adds

A way to comp a promotion without Paystack: generate a code, hand it to whoever should redeem it - an
affiliate, support, yourself - and it activates the promotion directly when they enter it, skipping payment
entirely. Each code can be used once, a set number of times, or an unlimited number of times before it stops
working; you generate a fresh one whenever you want to run another comped promotion.

### Database (`supabase/migrations/027_promo_codes.sql`)

- **`promo_codes`** - `code` (unique), `label` (free text - who it's for, e.g. "Instagram affiliate - @xyz"),
  `tier` (locks the code to one promotion tier, or `NULL` for any tier), `max_uses` / `times_used`, `status`
  (`active`/`revoked`), `expires_at` (optional - `NULL` means it never expires), `created_by`.
- **`promo_code_redemptions`** - one row per redemption: which code, who used it, on which post, which
  promotion it activated. This is the "who used what" trail behind offering codes via affiliation.
- **RLS is enabled with no policies on either table** - nothing is reachable from a client-side Supabase call.
  Every access goes through the admin (service-role) client from server code: the admin actions below, or the
  checkout route's redemption step. `supabase/diagnostics/promo_codes_health_check.sql` confirms this and a
  few other things directly in SQL.

### Generating and managing codes - `/promo-codes` in the admin panel

New page (`app/(admin)/promo-codes/`), linked from the admin sidebar under Content, next to Promotions.
Generate a code with a tier (or "any tier"), an optional label, a use limit (default 1), and an optional
expiry in days; the new code is shown once with a copy button. The table below lists every code with its
computed status (`active` / `used up` / `expired` / `revoked`) and use count, and lets you revoke an active
one. Visible to admins and moderators (matching the rest of `/promotions`), but only **admins** can generate
or revoke - `lib/actions/promo-codes.ts`'s `requireAdmin(false)` is the real boundary; the page hiding the
form/button from moderators is just so the UI doesn't offer something the server will refuse.

### Redeeming a code - the existing "Promote post" flow

`components/feed/promote-modal.tsx` gets a collapsed **"Have a promo code?"** link under the tier list;
entering one changes the button to "Apply code & promote". `app/api/promotions/checkout/route.ts` gets an
optional `promo_code` field: when present, it's validated (via `checkPromoCode` in `lib/promotions.ts`) and,
if valid, the promotion is inserted **already active** - with the tier's real price/duration recorded, just no
Paystack call - the code's use counter is incremented, a redemption row is logged, and one `admin_audit_log`
entry records who redeemed what, on which post. No `transactions`/wallet row is written - no money moved, so
nothing belongs in the finance ledger. Redemption attempts are rate-limited (10/hour per account) the same way
the chat PIN is, since a code is worth real money and shouldn't be guessable by brute force.

**If the code is locked to a specific tier, that tier is what gets granted - overriding whatever tier was
selected in the modal** - and the confirmation names the tier actually granted, not the one that was clicked.
Trying to redeem a tier-locked code against the wrong tier is rejected with a message naming the tier the
code *does* work for ("This code isn't valid for the Feature (7 days) tier"), not the one you asked for -
that's the actionable version of the message.

Every existing check still applies first, code or no code: you still can't promote someone else's post, and
you still can't double-promote a post that already has one pending or active. A blank/whitespace code is
treated as no code at all (falls through to the normal paid flow), not an error.

## How this was verified

Three levels, all against the real code:

- **`lib/promotions.ts`** (pure validation logic) - 12 unit tests: a valid any-tier code, no code at all,
  revoked, expiry at/either side of the exact boundary, single-use vs. multi-use exhaustion, a tier-locked
  code accepted/rejected correctly, priority when multiple problems apply at once, exact wording of every
  error message, code normalisation, and the generated-code alphabet/length/uniqueness.
- **`checkout/route.ts`** - the real route file, esbuild-bundled with only its Supabase client, `auditLog`,
  rate limiter, and `fetch` (Paystack) swapped for scripted stand-ins; 30 checks across 8 scenarios run
  directly against the actual `POST` handler: a valid code (no Paystack call, row active, code consumed,
  redemption logged, audit logged, no transactions row), a tier-locked code redeemed correctly, the same code
  rejected for the wrong tier (and left unconsumed), expired/revoked/exhausted/unknown codes, an
  already-promoted post and someone else's post both still blocked even with a valid code, rate-limiting,
  the unchanged ordinary paid path, and a blank code falling through to Paystack rather than erroring.
  This caught two real bugs before they shipped: the route wasn't trimming `promo_code` before checking it
  (so a whitespace-only value was treated as a real code and rejected instead of falling through to Paystack),
  and the tier-mismatch message named the tier you'd selected instead of the one the code actually requires.
- **UI** - `promote-modal.tsx` (16 browser checks: the code input stays collapsed until asked for, submits the
  trimmed code, an activated response with a different tier than selected still closes cleanly, an invalid
  code leaves the modal open with the button re-enabled, the ordinary paid path is unchanged) and the new
  admin form/table (10 checks: defaults, every field reaching the action correctly, a server error surfacing
  without a phantom code appearing, and revoke requiring confirmation before it actually calls anything).

Not verified: the live Supabase database (RLS actually behaving as the migration intends) and a real Paystack
account - neither is accessible from here. Run `promo_codes_health_check.sql` after applying the migration to
confirm the database side matches what the code above assumes.
