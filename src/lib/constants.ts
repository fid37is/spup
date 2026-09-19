// src/lib/constants.ts
//
// Values shared across features, kept together so a change like the
// "big transaction" threshold doesn't require hunting through several
// files for a hardcoded number.

/**
 * Withdrawals at or above this amount require BVN verification on top
 * of the NIN verification already required for any withdrawal. Below
 * it, NIN alone is enough — BVN stays out of the way for everyday use
 * and only comes up once a withdrawal is genuinely large.
 *
 * Adjust to match your compliance requirements.
 */
export const BIG_TRANSACTION_THRESHOLD_KOBO = 500_000_00 // ₦500,000
