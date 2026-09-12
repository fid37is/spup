# Escrow + wallet top-up — implementation notes

## Files in this drop

```
supabase/migrations/012_wallet_topup.sql
supabase/migrations/013_escrow_marketplace.sql
src/lib/actions/escrow.ts
src/lib/actions/escrow-admin.ts
src/lib/queries/escrow.ts
src/app/api/wallet/topup/checkout/route.ts
src/app/api/wallet/topup/verify/route.ts
src/app/api/cron/escrow-auto-release/route.ts
vercel.json
```

Run the migrations in order (`012` then `013`) — `013` doesn't reuse any
enum value added in `012`, but keep the numbering sequential regardless
since `012` fixes the missing `promotion_spend` enum value your existing
promotions code already depends on.

## Env vars to add

- `CRON_SECRET` — any random string. Used to authenticate the auto-release
  cron endpoint so it can't be triggered by randoms hitting the URL.

## Two small touches to existing files (not included as full rewrites
## since both are single-line and I didn't want to hand you a diff-sized
## change disguised as a full file to review)

1. **`vercel.json`** — I created a fresh one since none existed. If you're
   not on a Vercel Pro plan, the `*/15 * * * *` schedule (every 15 min)
   isn't available on Hobby (min. once/day there) — either upgrade or
   trigger the same endpoint via a Supabase `pg_cron` job / external
   scheduler (e.g. cron-job.org) hitting it with the `CRON_SECRET` bearer
   token instead.

2. **`src/lib/actions/admin.ts`** — `escrow-admin.ts` duplicates its
   `requireAdmin()`/`auditLog()` helpers rather than importing them,
   because they're declared without `export` there. Cleanest long-term
   fix: add `export` to both declarations in `admin.ts`, then swap the
   duplicated copies in `escrow-admin.ts` for an import. Left duplicated
   for now so this drop doesn't touch a file you didn't ask me to edit.

## What's *not* included (needs UI + your call on wording/design)

- **Buttons/screens**: "Pay Vendor" on a post, the order detail page
  (`/wallet/orders/[id]` — referenced in `revalidatePath` calls above),
  the dispute thread UI, admin disputes queue page. All server actions
  and queries are ready for these to call directly.
- **Wallet top-up button** in the existing wallet page, calling
  `POST /api/wallet/topup/checkout` with `{ amount_kobo }` and redirecting
  to the returned `authorization_url`.
- **Evidence uploads** can reuse the existing `/api/upload` route as-is
  (pass `type: 'image'` or `type: 'video'`) — it'll just file evidence
  photos under the same Cloudinary folder as post media. Fine functionally;
  if you want them separated, that route would need a new `mediaType`
  branch (e.g. `'evidence'` → `para/{id}/evidence`).
- **Notification rendering** — the new `notification_type` values
  (`escrow_hold_received`, `escrow_delivered`, `escrow_released`,
  `escrow_disputed`, `escrow_proposal`, `escrow_escalated`) need copy/icons
  added wherever your notifications list renders `type`.

## Design decisions baked in (flag if you want these changed)

- **Auto-release window**: 5 days after seller marks delivered. Constant
  `AUTO_RELEASE_DAYS` at the top of `escrow.ts`.
- **Dispute response window**: 48 hours before a party can escalate,
  though I didn't hard-block escalation before the deadline passes —
  worth deciding if you want that enforced strictly or left as a soft
  nudge (currently soft: either party can escalate any time after
  opening).
- **Minimum escrow payment**: ₦100. **Minimum wallet top-up**: ₦500,
  **max**: ₦500,000 per transaction — arbitrary ceilings, easy to change
  in the respective route files.
- **Seller must be `bvn_verified` to receive escrow** — buyer has no such
  requirement (they're spending money already in a wallet that itself
  required funding via a real card).
