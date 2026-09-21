// src/app/(admin)/dashboard/analytics/page.tsx
//
// Admin Insights: registrations by country and Nigerian state, devices, usage,
// content density and topics. Reads aggregates from the SQL functions in
// supabase/migrations/026_admin_analytics.sql through the service role.
// (Under dashboard/ because proxy.ts serves every admin.* path from /dashboard/*.)

import { getInsights, buildInsightsModel } from '@/lib/admin-insights'
import { NIGERIAN_INTERESTS } from '@/types'
import InsightsView from '@/components/admin/insights-view'

export const metadata = { title: 'Insights' }
export const dynamic = 'force-dynamic'

const PERIODS = [7, 30, 90]

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: daysParam } = await searchParams
  const parsed = Number(daysParam)
  const days = PERIODS.includes(parsed) ? parsed : 30

  const interestMeta = Object.fromEntries(
    NIGERIAN_INTERESTS.map(i => [i.id, { label: i.label, category: i.category }]),
  )

  const raw = await getInsights(days)
  const model = buildInsightsModel(raw, interestMeta)

  return <InsightsView model={model} days={days} />
}
