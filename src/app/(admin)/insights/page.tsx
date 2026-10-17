// src/app/(admin)/insights/page.tsx  ->  served at admin.spup.live/insights
//
// Admin Insights: registrations by country and Nigerian state, devices, usage,
// content density and topics. Reads aggregates from the SQL functions in
// supabase/migrations/026_admin_analytics.sql through the service role.
//
// Deliberately NOT called "analytics": every route group shares one URL space,
// and src/app/(main)/analytics is the creators' Premium analytics page. Two
// pages at the same path stop the build ("You cannot have two parallel pages
// that resolve to the same path").

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
