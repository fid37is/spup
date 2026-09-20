// src/app/api/admin/export/waitlist/route.ts
// GET /api/admin/export/waitlist?status=waiting|invited|joined|all
// CSV of waitlist emails (newest signups first). Admin only.

import { createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/actions/admin'
import { guardAdminRequest } from '@/lib/admin/route-guard'
import { fetchAllRows, toCsv, csvResponse, dateStamp } from '@/lib/admin/export'

export const dynamic = 'force-dynamic'

const STATUSES = ['waiting', 'invited', 'joined', 'all']

type WaitlistExportRow = {
  full_name: string
  email: string | null
  phone: string | null
  referrer: string | null
  position: number
  status: string
  created_at: string
  invited_at: string | null
}

export async function GET(request: Request) {
  const guard = await guardAdminRequest()
  if (!guard.ok) return guard.response

  const status = new URL(request.url).searchParams.get('status') || 'all'
  if (!STATUSES.includes(status)) {
    return Response.json({ error: 'Invalid status filter' }, { status: 400 })
  }

  const db = createAdminClient()

  let rows: WaitlistExportRow[]
  try {
    const result = await fetchAllRows<WaitlistExportRow>((from, to) => {
      let req = db
        .from('waitlist')
        .select('full_name, email, phone, referrer, position, status, created_at, invited_at')
        .order('created_at', { ascending: false })
        .order('position', { ascending: false })
        .range(from, to)
      if (status !== 'all') req = req.eq('status', status)
      return req
    })
    rows = result.rows
  } catch (err) {
    console.error('[export waitlist] query failed:', err)
    return Response.json({ error: 'Could not load the waitlist for export' }, { status: 500 })
  }

  // Phone-only signups have no email to export.
  const withEmail = rows.filter(r => r.email && r.email.trim())
  const skipped = rows.length - withEmail.length

  await auditLog(guard.profile.id, 'export_waitlist_emails', 'waitlist', 'bulk', {
    count: withEmail.length, skipped_no_email: skipped, status,
  })

  const csv = toCsv(
    ['email', 'full_name', 'phone', 'referrer', 'position', 'status', 'signed_up_at', 'invited_at'],
    withEmail.map(r => [
      r.email!.trim(), r.full_name, r.phone, r.referrer, r.position, r.status, r.created_at, r.invited_at,
    ]),
  )

  return csvResponse(csv, `spup-waitlist-emails-${status}-${dateStamp()}.csv`, {
    'X-Export-Count': withEmail.length,
    'X-Export-Skipped': skipped,
  })
}
