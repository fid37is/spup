// src/lib/admin/export.ts
// Shared helpers for admin exports: paged reads, CSV building, base64, masking.
//
// Server-side only. Deliberately has no 'use server' directive and imports
// nothing from lib/actions/admin.ts (that file imports this one).

/**
 * PostgREST caps a single response at 1000 rows by default. Anything that
 * needs "every row" (exports, bulk sends) has to page through the table -
 * a plain `.select()` silently stops at 1000 with no error.
 */
export const EXPORT_PAGE_SIZE = 1000

type PageResult = { data: unknown[] | null; error: { message: string } | null }

/**
 * Reads every row a query matches by requesting it in pages of 1000.
 *
 * `buildPage` must return a query with a STABLE, UNIQUE ordering (add the
 * primary key as the last `.order()`), otherwise rows can repeat or be
 * skipped across page boundaries.
 *
 * Throws if any page errors, so callers never mistake a failed read for a
 * short result. When `maxRows` is set, `truncated` is true if the cap was
 * reached with more rows possibly remaining (it can be a false positive when
 * the table holds exactly `maxRows` rows).
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  buildPage: (from: number, to: number) => PromiseLike<PageResult>,
  { maxRows = Number.POSITIVE_INFINITY }: { maxRows?: number } = {},
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = []
  for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + EXPORT_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as T[]
    rows.push(...batch)
    if (batch.length < EXPORT_PAGE_SIZE) return { rows, truncated: false }
    if (rows.length >= maxRows) return { rows: rows.slice(0, maxRows), truncated: true }
  }
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

// Cells starting with these are interpreted as formulas by Excel / Sheets.
// Names, emails and referrers here are user-supplied (public signup form),
// so a value like `=HYPERLINK(...)` would otherwise execute when an admin
// opens the export. Prefixing an apostrophe makes the spreadsheet treat it
// as plain text.
const FORMULA_START = /^[=+\-@\t\r]/
// International phone numbers legitimately start with "+", so leave those alone.
const PHONE_LIKE = /^\+\d[\d\s()-]{5,}$/

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (FORMULA_START.test(s) && !PHONE_LIKE.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Builds an RFC 4180 CSV with a UTF-8 BOM so Excel reads names like "Chidinma Ọkọrọ" correctly. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map(r => r.map(csvCell).join(','))
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}

export function csvResponse(csv: string, filename: string, meta: Record<string, string | number> = {}) {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      ...Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, String(v)])),
    },
  })
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

/** YYYY-MM-DD, for export filenames. */
export function dateStamp(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

/** UTF-8 safe base64 that works in both Node and edge/worker runtimes. */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** "jane.doe@gmail.com" -> "j***@gmail.com" */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  // Fixed-width mask so the result doesn't reveal how long the address is.
  return `${local.slice(0, 1)}***@${domain}`
}
