// src/app/api/admin/export/users/route.ts
// GET /api/admin/export/users?q=&status=
// CSV of user emails. Honours the same search/status filters as the Users
// page, but exports every match - not just the visible page. Admin only.

import { createAdminClient } from '@/lib/supabase/server'
import { sanitizeFilterTerm } from '@/lib/utils'
import { auditLog } from '@/lib/actions/admin'
import { guardAdminRequest } from '@/lib/admin/route-guard'
import { fetchAllRows, toCsv, csvResponse, dateStamp } from '@/lib/admin/export'

export const dynamic = 'force-dynamic'

const STATUSES = ['active', 'suspended', 'banned', 'pending_verification']

type UserEmailRow = {
  email: string | null
  display_name: string
  username: string
  status: string
  created_at: string
}

export async function GET(request: Request) {
  const guard = await guardAdminRequest()
  if (!guard.ok) return guard.response

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  const status = searchParams.get('status') || ''

  if (status && !STATUSES.includes(status)) {
    return Response.json({ error: 'Invalid status filter' }, { status: 400 })
  }

  const db = createAdminClient()

  let rows: UserEmailRow[]
  try {
    // Same filters as app/(admin)/users/page.tsx so "what I see" == "what I export".
    const result = await fetchAllRows<UserEmailRow>((from, to) => {
      let req = db
        .from('users')
        .select('email, display_name, username, status, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)

      if (q) {
        const term = sanitizeFilterTerm(q)
        req = req.or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
      }
      if (status) req = req.eq('status', status)
      return req
    })
    rows = result.rows
  } catch (err) {
    console.error('[export users] query failed:', err)
    return Response.json({ error: 'Could not load users for export' }, { status: 500 })
  }

  // Phone-only accounts have no email - nothing to export for them.
  const withEmail = rows.filter(r => r.email && r.email.trim())
  const skipped = rows.length - withEmail.length

  await auditLog(guard.profile.id, 'export_user_emails', 'user', 'bulk', {
    count: withEmail.length, skipped_no_email: skipped, q: q || null, status: status || null,
  })

  const csv = toCsv(
    ['email', 'display_name', 'username', 'status', 'joined_at'],
    withEmail.map(r => [r.email!.trim(), r.display_name, r.username, r.status, r.created_at]),
  )

  return csvResponse(csv, `spup-user-emails-${dateStamp()}.csv`, {
    'X-Export-Count': withEmail.length,
    'X-Export-Skipped': skipped,
  })
}
