'use server'

// src/lib/actions/announcements.ts
//
// Admin-only: create and end the announcement banners shown at the top of the
// feed. Reading them for display happens in app/(main)/feed/page.tsx. Admin only,
// not moderator - this puts a message in front of every user.

import { revalidatePath } from 'next/cache'
import { requireAdmin, auditLog } from '@/lib/actions/admin'
import { validateAnnouncementInput, type AnnouncementInput } from '@/lib/announcements'

export async function createAnnouncementAction(input: AnnouncementInput) {
  const { error, admin, profile } = await requireAdmin(false)
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  const invalid = validateAnnouncementInput(input)
  if (invalid) return { error: invalid }

  const ctaLabel = input.ctaLabel?.trim() || null
  const ctaUrl = input.ctaUrl?.trim() || null

  const { data, error: insertError } = await admin
    .from('announcements')
    .insert({
      kind: input.kind,
      title: input.title.trim(),
      body: input.body.trim(),
      cta_label: ctaLabel && ctaUrl ? ctaLabel : null,
      cta_url: ctaLabel && ctaUrl ? ctaUrl : null,
      starts_at: input.startsAt || new Date().toISOString(),
      ends_at: input.endsAt || null,
      remind_after_hours: input.remindAfterHours ?? null,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (insertError || !data) {
    console.error('[createAnnouncementAction] insert failed:', insertError?.message)
    return { error: 'Could not publish the announcement' }
  }

  await auditLog(profile.id, 'create_announcement', 'announcement', data.id, { kind: input.kind, title: input.title.trim() })
  revalidatePath('/announcements')
  return { success: true as const }
}

export async function endAnnouncementAction(id: string) {
  const { error, admin, profile } = await requireAdmin(false)
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  const { error: updateError } = await admin
    .from('announcements')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (updateError) return { error: 'Could not end the announcement' }

  await auditLog(profile.id, 'end_announcement', 'announcement', id, {})
  revalidatePath('/announcements')
  return { success: true as const }
}
