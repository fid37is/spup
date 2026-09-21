// src/components/admin/insights-view.tsx
//
// Presentation for the admin Insights page. Pure display: it receives the
// ready-made model from buildInsightsModel() and renders it. No client JS.

import Link from 'next/link'
import { Users, UserPlus, Activity, TrendingUp, MapPin, FileText, Hash } from 'lucide-react'
import { StatCard } from '@/components/admin/stat-card'
import type { InsightsModel, BarRow, Growth, Section } from '@/lib/admin-insights'

const BRAND = 'var(--color-brand)'
const BLUE = '#378ADD'
const GOLD = '#D4A017'

const n = (v: number) => v.toLocaleString('en-NG')
const pct = (share: number) => (share > 0 && share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`)
const dateLabel = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })

// ── Building blocks ─────────────────────────────────────────────────────────
function Panel({ title, hint, children, className = '' }: {
  title: string; hint?: string; children: React.ReactNode; className?: string
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-border bg-surface ${className}`}>
      <div className="border-b border-[#1A1A20] px-4 py-3.5 sm:px-5">
        <h2 className="font-display text-[15px] font-bold text-primary">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-faint">{children}</p>
}

function SectionError({ error }: { error: string }) {
  return (
    <div className="rounded-2xl border border-error/20 bg-surface p-5">
      <p className="text-sm font-semibold text-error">This section couldn&apos;t load.</p>
      <p className="mt-1 text-xs text-faint">
        If you haven&apos;t yet, run <code>supabase/migrations/026_admin_analytics.sql</code> in the Supabase SQL editor, then refresh.
      </p>
      <p className="mt-2 break-words text-[11px] text-faint">{error}</p>
    </div>
  )
}

function Bars({ rows, color = BRAND, empty = 'Nothing to show yet.' }: {
  rows: BarRow[]; color?: string; empty?: string
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>
  const max = Math.max(...rows.map(r => r.value), 1)
  return (
    <ul className="m-0 list-none space-y-3 p-0">
      {rows.map(r => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-primary">
              {r.label}
              {r.badge && <span className="ml-1.5 text-[11px] text-faint">{r.badge}</span>}
            </span>
            <span className="flex-shrink-0 text-secondary">
              {n(r.value)} <span className="text-faint">· {pct(r.share)}</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--color-surface-3)]">
            <div className="h-full rounded-full" style={{ width: `${Math.max((r.value / max) * 100, 2)}%`, background: color }} />
          </div>
          {r.note && <div className="mt-0.5 text-[11px] text-faint">{r.note}</div>}
        </li>
      ))}
    </ul>
  )
}

function Columns({ data, color = BRAND, label }: {
  data: { day: string; count: number }[]; color?: string; label: string
}) {
  if (data.length === 0) return <Empty>No data for this period.</Empty>
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div role="img" aria-label={label}>
      <div className="flex h-32 items-end gap-[3px]">
        {data.map(d => (
          <div
            key={d.day}
            title={`${dateLabel(d.day)}: ${n(d.count)}`}
            className="min-w-0 flex-1 rounded-t-sm"
            style={{ height: `${d.count === 0 ? 2 : Math.max((d.count / max) * 100, 4)}%`, background: d.count === 0 ? 'var(--color-surface-3)' : color }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-faint">
        <span>{dateLabel(data[0].day)}</span>
        <span>peak {n(max)}/day</span>
        <span>{dateLabel(data[data.length - 1].day)}</span>
      </div>
    </div>
  )
}

function Delta({ g, suffix = 'vs previous period' }: { g: Growth; suffix?: string }) {
  if (g.dir === 'new') return <span className="text-[#1A9E5F]">New {suffix}</span>
  if (g.pct === null) return <span>No change {suffix}</span>
  const cls = g.dir === 'up' ? 'text-[#1A9E5F]' : g.dir === 'down' ? 'text-error' : ''
  const sign = g.pct > 0 ? '+' : ''
  return <span className={cls}>{sign}{g.pct}% {suffix}</span>
}

function Guard<T>({ s, children }: { s: Section<T>; children: (d: T) => React.ReactNode }) {
  return s.ok ? <>{children(s.data)}</> : <SectionError error={s.error} />
}

function PeriodTabs({ days }: { days: number }) {
  return (
    <div className="inline-flex rounded-xl border border-border bg-surface p-1">
      {[7, 30, 90].map(d => (
        <Link
          key={d}
          href={`?days=${d}`}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold no-underline ${
            d === days ? 'bg-[color:var(--color-surface-3)] text-primary' : 'text-faint'
          }`}
        >
          {d} days
        </Link>
      ))}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function InsightsView({ model, days }: { model: InsightsModel; days: number }) {
  const { registrations: reg, usage, devices, content, topics } = model
  const tracked = usage.ok && usage.data.activePeriod > 0

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-7">
        <div>
          <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight text-primary sm:text-[26px]">Insights</h1>
          <p className="text-sm text-faint">Who is joining, where from, on what, and what they do. Last {days} days unless noted.</p>
        </div>
        <PeriodTabs days={days} />
      </div>

      {/* ── Headline numbers ── */}
      <div className="mb-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 xl:grid-cols-6">
        {reg.ok ? (
          <>
            <StatCard icon={Users} label="Total users" value={n(reg.data.total)} sub={`${n(reg.data.geography.nigeriaUsers)} in Nigeria`} />
            <StatCard icon={UserPlus} label={`New in ${days} days`} value={n(reg.data.newPeriod)} sub={undefined} color="#378ADD" />
          </>
        ) : null}
        {usage.ok ? (
          <>
            <StatCard icon={Activity} label="Active today" value={n(usage.data.dauToday)} sub={usage.data.mau > 0 ? `${n(usage.data.mau)} in 30 days` : 'Tracking starts on deploy'} />
            <StatCard icon={TrendingUp} label="Stickiness" value={usage.data.stickiness === null ? '-' : pct(usage.data.stickiness)} sub="Daily / monthly active" color={GOLD} />
          </>
        ) : null}
        {content.ok ? (
          <StatCard icon={FileText} label={`Posts in ${days} days`} value={n(content.data.totalPosts)} sub={content.data.postsPerAuthor === null ? undefined : `${content.data.postsPerAuthor} per active author`} color="#378ADD" />
        ) : null}
        {reg.ok ? (
          <StatCard
            icon={MapPin}
            label="Location known"
            value={reg.data.total > 0 ? pct((reg.data.geography.detected + reg.data.geography.estimated) / reg.data.total) : '-'}
            sub={`${n(reg.data.geography.detected)} detected`}
            color={GOLD}
          />
        ) : null}
      </div>

      <div className="space-y-4 lg:space-y-5">
        {/* ── Registrations ── */}
        <Guard s={reg}>{r => (
          <Panel
            title="Registrations"
            hint={`${n(r.newPeriod)} new in the last ${days} days`}
          >
            <div className="mb-3 text-xs text-faint"><Delta g={r.growth} /></div>
            <Columns data={r.daily} label="New registrations per day" />
          </Panel>
        )}</Guard>

        {/* ── Geography ── */}
        <Guard s={reg}>{r => {
          const g = r.geography
          const topStates = g.states.slice(0, 20)
          return (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
              <Panel title="Registrations by country" hint="All users, all time">
                <Bars
                  color={BRAND}
                  empty="No locations known yet."
                  rows={g.countries.slice(0, 15).map(c => ({
                    label: `${c.flag} ${c.name}`.trim(),
                    value: c.count,
                    share: g.totalUsers > 0 ? c.count / g.totalUsers : 0,
                    note: c.estimated > 0 ? `${n(c.detected)} detected · ${n(c.estimated)} estimated from profile` : undefined,
                  }))}
                />
                <div className="mt-4 border-t border-[#1A1A20] pt-3 text-[11px] leading-relaxed text-faint">
                  {n(g.detected)} detected from where people opened Spup · {n(g.estimated)} estimated from the
                  location they typed on their profile · {n(g.unknown)} unknown. Detection began with this update, so
                  older accounts fill in as they come back.
                </div>
              </Panel>

              <Panel title="Nigeria by state" hint={`${n(g.nigeriaWithState)} of ${n(g.nigeriaUsers)} Nigerian users placed in a state · ${g.statesWithUsers} of 37 states`}>
                <Bars
                  color={BLUE}
                  empty="No Nigerian states known yet."
                  rows={topStates.map(s => ({
                    label: s.state,
                    value: s.count,
                    share: g.nigeriaUsers > 0 ? s.count / g.nigeriaUsers : 0,
                    note: s.estimated > 0 ? `${n(s.detected)} detected · ${n(s.estimated)} estimated` : undefined,
                  }))}
                />
                {g.states.length > topStates.length && (
                  <p className="mt-3 text-[11px] text-faint">+ {g.states.length - topStates.length} more states with users</p>
                )}
                {g.statesEmpty.length > 0 && g.statesWithUsers > 0 && (
                  <details className="mt-3 text-[11px] text-faint">
                    <summary className="cursor-pointer">{g.statesEmpty.length} states with no users yet</summary>
                    <p className="mt-1 leading-relaxed">{g.statesEmpty.join(', ')}</p>
                  </details>
                )}
              </Panel>
            </div>
          )
        }}</Guard>

        {/* ── Devices ── */}
        <Guard s={devices}>{d => (
          <Panel
            title="Devices"
            hint={
              d.activeUsers > 0
                ? `From the last visit of ${n(d.activeUsers)} people in the last ${days} days${d.coverage !== null ? ` (${pct(d.coverage)} of all users)` : ''}`
                : 'Recorded when people open Spup'
            }
          >
            {d.activeUsers === 0 ? (
              <Empty>No visits recorded yet. Device data starts filling in as people open the app after this update.</Empty>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                <div><h3 className="mb-3 text-xs font-semibold tracking-wide text-secondary">Device</h3><Bars rows={d.deviceTypes} color={BRAND} /></div>
                <div><h3 className="mb-3 text-xs font-semibold tracking-wide text-secondary">Operating system</h3><Bars rows={d.os} color={BLUE} /></div>
                <div><h3 className="mb-3 text-xs font-semibold tracking-wide text-secondary">Browser</h3><Bars rows={d.browsers} color={GOLD} /></div>
                <div><h3 className="mb-3 text-xs font-semibold tracking-wide text-secondary">How they open Spup</h3><Bars rows={d.appModes} color={BRAND} /></div>
              </div>
            )}
            {d.signupDevices.length > 0 && (
              <div className="mt-6 border-t border-[#1A1A20] pt-4">
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-secondary">Device people signed up on</h3>
                <Bars rows={d.signupDevices} color={BLUE} />
              </div>
            )}
          </Panel>
        )}</Guard>

        {/* ── Usage ── */}
        <Guard s={usage}>{u => (
          <>
            <Panel
              title="Usage"
              hint={u.trackingSince ? `Tracking since ${dateLabel(u.trackingSince)}` : 'Tracking starts when people open the app after this update'}
            >
              {!tracked ? (
                <Empty>No activity recorded yet.</Empty>
              ) : (
                <>
                  <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Active today', value: n(u.dauToday) },
                      { label: 'Active this week', value: n(u.wau) },
                      { label: 'Active this month', value: n(u.mau) },
                      { label: '7-day return rate', value: u.retention7.pct === null ? '-' : `${u.retention7.pct}%`, sub: `${n(u.retention7.retained)} of ${n(u.retention7.eligible)} older accounts` },
                    ].map(k => (
                      <div key={k.label} className="rounded-xl bg-[color:var(--color-surface-2)] p-3">
                        <div className="text-[11px] text-faint">{k.label}</div>
                        <div className="font-display text-xl font-extrabold text-primary">{k.value}</div>
                        {k.sub && <div className="text-[11px] text-faint">{k.sub}</div>}
                      </div>
                    ))}
                  </div>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-secondary">Daily active users</h3>
                  <Columns data={u.daily} color={BLUE} label="Daily active users" />
                  <p className="mt-3 text-[11px] text-faint">
                    {u.sessionsPerActive !== null ? `${u.sessionsPerActive} visits per active person in this period.` : ''}
                  </p>
                </>
              )}
            </Panel>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
              <Panel title="When people are active" hint="Posts and likes, Nigerian time">
                {u.peakHour === null ? <Empty>No activity in this period.</Empty> : (
                  <>
                    <div role="img" aria-label="Activity by hour of day" className="flex h-28 items-end gap-[3px]">
                      {(() => { const max = Math.max(...u.hours.map(h => h.count), 1); return u.hours.map(h => (
                        <div key={h.hour} title={`${h.label}: ${n(h.count)}`} className="min-w-0 flex-1 rounded-t-sm"
                          style={{ height: `${h.count === 0 ? 2 : Math.max((h.count / max) * 100, 4)}%`, background: h.count === 0 ? 'var(--color-surface-3)' : BRAND }} />
                      )) })()}
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-faint"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
                    <p className="mt-3 text-xs text-secondary">Busiest hour: <strong className="text-primary">{u.peakHour}</strong>{u.peakWeekday ? <> · busiest day: <strong className="text-primary">{u.peakWeekday}</strong></> : null}</p>
                    <div className="mt-3 flex gap-1.5">
                      {u.weekdays.map(w => { const max = Math.max(...u.weekdays.map(x => x.count), 1); return (
                        <div key={w.label} className="flex-1 text-center" title={`${w.label}: ${n(w.count)}`}>
                          <div className="mx-auto h-10 w-full overflow-hidden rounded bg-[color:var(--color-surface-3)]">
                            <div className="w-full" style={{ height: `${(w.count / max) * 100}%`, background: BLUE, marginTop: `${100 - (w.count / max) * 100}%` }} />
                          </div>
                          <div className="mt-1 text-[10px] text-faint">{w.label}</div>
                        </div>
                      ) })}
                    </div>
                  </>
                )}
              </Panel>

              <Panel title="What people do" hint={`Actions in the last ${days} days${tracked ? ', and per active person' : ''}`}>
                <ul className="m-0 list-none divide-y divide-[#141418] p-0">
                  {u.actions.map(a => (
                    <li key={a.label} className="flex items-center justify-between py-2.5 text-[13px]">
                      <span className="text-primary">{a.label}</span>
                      <span className="text-secondary">
                        {n(a.count)}
                        {a.perActive !== null && <span className="ml-2 text-faint">{a.perActive} each</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </>
        )}</Guard>

        {/* ── Content density ── */}
        <Guard s={content}>{c => (
          <>
            <Panel
              title="Content density"
              hint={`${n(c.totalPosts)} posts from ${n(c.activeAuthors)} people in the last ${days} days`}
            >
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Posts per active author', value: c.postsPerAuthor === null ? '-' : String(c.postsPerAuthor) },
                  { label: 'Posts with media', value: c.mediaShare === null ? '-' : pct(c.mediaShare) },
                  { label: 'Average post length', value: c.avgLength === null ? '-' : `${c.avgLength} chars` },
                  ...(c.selling === null ? [] : [{ label: 'Selling posts', value: n(c.selling) }]),
                ].map(k => (
                  <div key={k.label} className="rounded-xl bg-[color:var(--color-surface-2)] p-3">
                    <div className="text-[11px] text-faint">{k.label}</div>
                    <div className="font-display text-xl font-extrabold text-primary">{k.value}</div>
                  </div>
                ))}
              </div>
              <Columns data={c.daily} color={BRAND} label="Posts per day" />
            </Panel>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
              <Panel title="What people post" hint="By type"><Bars rows={c.types} color={BRAND} /></Panel>
              <Panel title="Photos and video" hint="Media attached to posts"><Bars rows={c.media} color={BLUE} empty="No media in this period." /></Panel>
              <Panel title="Language" hint="Language set on posts"><Bars rows={c.languages} color={GOLD} /></Panel>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
              <Panel title="Posts per person" hint="All time, everyone registered - how concentrated is the content?">
                <Bars rows={c.buckets} color={BRAND} />
              </Panel>
              <Panel title="Content by state" hint="Posts in this period vs people detected in that state">
                {c.regional.length === 0 ? <Empty>No state data yet.</Empty> : (
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="text-left text-[11px] text-faint">
                        <th className="pb-2 font-medium">State</th>
                        <th className="pb-2 text-right font-medium">People</th>
                        <th className="pb-2 text-right font-medium">Posts</th>
                        <th className="pb-2 text-right font-medium">Per person</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.regional.slice(0, 12).map(r => (
                        <tr key={r.state} className="border-t border-[#141418]">
                          <td className="py-2 text-primary">{r.state}</td>
                          <td className="py-2 text-right text-secondary">{n(r.users)}</td>
                          <td className="py-2 text-right text-secondary">{n(r.posts)}</td>
                          <td className="py-2 text-right text-secondary">{r.postsPerUser ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>
            </div>
          </>
        )}</Guard>

        {/* ── Topics ── */}
        <Guard s={topics}>{t => (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
            <Panel
              title="Trending hashtags"
              hint={`${n(t.uniqueTags)} different tags${t.taggedShare !== null ? ` · ${pct(t.taggedShare)} of posts use one` : ''}`}
            >
              {t.hashtags.length === 0 ? <Empty>No hashtags used in this period.</Empty> : (
                <ul className="m-0 list-none divide-y divide-[#141418] p-0">
                  {t.hashtags.slice(0, 15).map(h => (
                    <li key={h.tag} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                      <span className="flex min-w-0 items-center gap-1.5 text-primary"><Hash size={13} color={BRAND} /><span className="truncate">{h.tag}</span></span>
                      <span className="flex-shrink-0 text-secondary">{n(h.count)} <span className="ml-1 text-[11px] text-faint"><Delta g={h.change} suffix="" /></span></span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title="What people are interested in"
              hint={`Interests chosen by ${n(t.usersWithInterests)} people`}
            >
              {t.interests.length === 0 ? <Empty>No interests chosen yet.</Empty> : (
                <>
                  <h3 className="mb-3 text-xs font-semibold tracking-wide text-secondary">By category</h3>
                  <Bars rows={t.interestCategories} color={GOLD} />
                  <h3 className="mb-3 mt-5 text-xs font-semibold tracking-wide text-secondary">Top interests</h3>
                  <Bars rows={t.interests.slice(0, 10)} color={BRAND} />
                </>
              )}
            </Panel>
          </div>
        )}</Guard>
      </div>
    </div>
  )
}
