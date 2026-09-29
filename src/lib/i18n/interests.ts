// Interest names come from NIGERIAN_INTERESTS (src/types) as English labels.
// Look up interests.<id> in the dictionary; if a key is missing (a newly added
// interest, say) fall back to the English label so nothing renders as a raw key.
type T = (key: string, vars?: Record<string, string | number>) => string

export function interestLabel(t: T, interest: { id: string; label: string }): string {
  const key = `interests.${interest.id}`
  const value = t(key)
  return value === key ? interest.label : value
}
