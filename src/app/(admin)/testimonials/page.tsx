// src/app/(admin)/testimonials/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import TestimonialActions from './testimonial-actions'

interface SearchParams { status?: string }

async function getTestimonials(params: SearchParams) {
  const admin = createAdminClient()
  const status = params.status || 'pending'

  const { data } = await admin
    .from('testimonials')
    .select('id, name, handle, location, quote, earned_label, status, created_at')
    .eq('status', status)
    .order('created_at', { ascending: status === 'pending' })
    .limit(50)

  return data || []
}

async function getCounts() {
  const admin = createAdminClient()
  const statuses = ['pending', 'approved', 'rejected']
  const counts: Record<string, number> = {}
  await Promise.all(statuses.map(async s => {
    const { count } = await admin.from('testimonials').select('id', { count: 'exact', head: true }).eq('status', s)
    counts[s] = count || 0
  }))
  return counts
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:  { bg: 'rgba(212,160,23,0.12)', color: '#D4A017' },
  approved: { bg: 'rgba(26,158,95,0.12)',  color: '#1A9E5F' },
  rejected: { bg: 'rgba(229,57,53,0.12)',  color: '#E53935' },
}

export default async function AdminTestimonialsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const [testimonials, counts] = await Promise.all([getTestimonials(params), getCounts()])
  const activeStatus = params.status || 'pending'

  const TABS = [
    { key: 'pending',  label: 'Pending review' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
  ]

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Testimonials</h1>
        <p className="mt-0.5 text-sm text-faint">Approve reviews before they show on the homepage</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(tab => (
          <Link
            key={tab.key}
            href={`?status=${tab.key}`}
            className="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 font-display text-[13px] font-semibold no-underline sm:px-4"
            style={{
              color: activeStatus === tab.key ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
              borderBottomColor: activeStatus === tab.key ? 'var(--color-brand)' : 'transparent',
            }}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span
                className="rounded-lg px-1.5 py-0.5 text-[10px] font-extrabold"
                style={{
                  background: tab.key === 'pending' ? 'var(--color-gold)' : 'var(--color-surface-3)',
                  color: tab.key === 'pending' ? '#000' : 'var(--color-text-secondary)',
                }}
              >
                {counts[tab.key]}
              </span>
            )}
          </Link>
        ))}
      </div>

      {testimonials.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-5 py-16 text-center">
          <p className="text-[15px] text-faint">No {activeStatus} testimonials</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {testimonials.map((t: any) => {
            const pill = STATUS_STYLE[t.status] || STATUS_STYLE.pending
            return (
              <div key={t.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="flex flex-col gap-3.5 border-b border-[#141418] p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-display text-base font-bold text-primary">{t.name}</span>
                      <span className="rounded px-2 py-0.5 text-[11px] font-bold" style={{ background: pill.bg, color: pill.color }}>
                        {t.status.toUpperCase()}
                      </span>
                      {t.earned_label && (
                        <span className="rounded bg-[color:var(--color-surface-3)] px-1.5 py-0.5 text-[11px] text-faint">
                          {t.earned_label}
                        </span>
                      )}
                    </div>
                    <p className="mb-2 text-sm italic leading-relaxed text-secondary">&ldquo;{t.quote}&rdquo;</p>
                    <div className="break-words text-xs text-faint">
                      {[t.handle, t.location].filter(Boolean).join(' · ') || 'No handle/location given'}
                      {' · '}
                      {new Date(t.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>

                {t.status === 'pending' && (
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-end sm:p-5">
                    <TestimonialActions testimonialId={t.id} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
