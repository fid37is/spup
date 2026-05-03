/**
 * Formats a creator count for display.
 * - Below 1000: exact number, no suffix  →  3, 47, 999
 * - 1000+: condensed with K+             →  1K+, 1.5K+, 12K+
 */
export function formatCreatorCount(count: number): string {
  if (count < 1000) return count.toString()
  const k = count / 1000
  const rounded = Math.floor(k * 10) / 10
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded}K+`
}