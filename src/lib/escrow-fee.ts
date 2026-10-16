// src/lib/escrow-fee.ts
// Escrow fee maths shared by the server action and the payment dialog, so the
// number the buyer SEES is always the number they are CHARGED.

/** Fee in kobo for an order amount, from basis points (500 = 5%). */
export function computeEscrowFeeKobo(amountKobo: number, bps: number): number {
  if (!Number.isFinite(amountKobo) || !Number.isFinite(bps) || bps <= 0) return 0
  return Math.round((amountKobo * bps) / 10_000)
}

export const DEFAULT_ESCROW_FEE_BPS = 500 // 5% — only used if the setting row is missing
