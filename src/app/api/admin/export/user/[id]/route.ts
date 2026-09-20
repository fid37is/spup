// src/app/api/admin/export/user/[id]/route.ts
// GET /api/admin/export/user/:id
// Downloads one user's personal data as JSON (data-access request). Admin only.

import { auditLog } from '@/lib/actions/admin'
import { guardAdminRequest } from '@/lib/admin/route-guard'
import { buildUserDataExport } from '@/lib/admin/user-data-export'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardAdminRequest()
  if (!guard.ok) return guard.response

  const { id } = await params
  const built = await buildUserDataExport(id)

  if (!built.ok) {
    const status = built.error === 'User not found' ? 404 : built.error === 'Invalid user id' ? 400 : 500
    return Response.json({ error: built.error }, { status })
  }

  // Record who pulled this and what was in it - never the data itself.
  await auditLog(guard.profile.id, 'user_data_export', 'user', id, { sections: built.sectionCounts })

  return new Response(built.json, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${built.filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
