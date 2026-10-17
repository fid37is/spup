// src/components/analytics/charts.tsx
'use client'

// Small, dependency-free SVG charts for the analytics page. They size themselves
// to their container (so they fit a phone as well as a desktop column), follow
// the app's theme variables, and are touch-friendly: drag a finger across a
// chart to read each point.

import { useEffect, useId, useRef, useState } from 'react'
import { niceScale, compact } from '@/lib/analytics-math'

const MUTED = { fill: 'var(--color-text-muted)' } as const

// ─── Time chart: line (with soft area) or bars, optional second metric ────────

export interface ChartSeries {
  name: string
  color: string
  values: number[]
  /** how a value is written in the tooltip, e.g. 1.2K or 3.8% */
  format: (n: number) => string
  /** counts are whole numbers, so the axis never shows 0.5 */
  integer?: boolean
}

export function TimeChart({ labels, xLabels, series, type, ariaLabel }: {
  /** one tooltip title per point, e.g. "Jul 21 - Jul 27" */
  labels: string[]
  /** one short axis label per point, e.g. "Jul 21" */
  xLabels: string[]
  /** series[0] is the main one (left axis); series[1], if any, has its own right axis */
  series: ChartSeries[]
  type: 'line' | 'bar'
  ariaLabel: string
}) {
  const gradId = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const wrapRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setW(Math.floor(el.clientWidth))
    const ro = new ResizeObserver(entries => setW(Math.floor(entries[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // a new set of data (range, metric, grouping changed) clears any open tooltip
  useEffect(() => { setHover(null) }, [labels.length, series[0]?.name, series[1]?.name, type])

  const n = labels.length
  const primary = series[0]
  const secondary = series[1]
  const height = w >= 560 ? 260 : 220

  const scaleOf = (s: ChartSeries) => niceScale(Math.max(0, ...s.values), 4, s.integer)
  const sc1 = scaleOf(primary)
  const sc2 = secondary ? scaleOf(secondary) : null
  const ticks = (sc: { max: number; step: number }) => Array.from({ length: 5 }, (_, i) => i * sc.step)
  const axisWidth = (sc: { max: number; step: number }) => Math.max(...ticks(sc).map(t => compact(t).length)) * 6.4

  const padT = 10
  const padB = 24
  const padL = 8 + axisWidth(sc1)
  const padR = sc2 ? 8 + axisWidth(sc2) : 10
  const plotW = Math.max(10, w - padL - padR)
  const plotH = height - padT - padB
  const yBase = padT + plotH

  const barMode = type === 'bar'
  const xAt = (i: number) => {
    if (barMode) return padL + ((i + 0.5) * plotW) / n
    return n > 1 ? padL + (i * plotW) / (n - 1) : padL + plotW / 2
  }
  const yAt = (v: number, sc: { max: number }) => padT + plotH - (Math.min(v, sc.max) / sc.max) * plotH

  const empty = series.every(s => s.values.every(v => v === 0))

  // x axis: as many labels as fit, counted back from the newest point
  const maxLabels = Math.max(2, Math.floor(plotW / 66))
  const every = Math.max(1, Math.ceil(n / maxLabels))
  const showX = (i: number) => (n - 1 - i) % every === 0
  const clampX = (x: number) => Math.min(Math.max(x, padL + 18), w - padR - 18)

  function pointFrom(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - box.left
    let i: number
    if (barMode) i = Math.floor(((x - padL) / plotW) * n)
    else i = n > 1 ? Math.round(((x - padL) / plotW) * (n - 1)) : 0
    setHover(Math.min(n - 1, Math.max(0, i)))
  }

  const line = (s: ChartSeries, sc: { max: number }) =>
    s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)} ${yAt(v, sc).toFixed(1)}`).join(' ')

  const bw = Math.max(2, Math.min(28, (plotW / Math.max(n, 1)) * 0.62))

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      {w > 0 && (
        <svg
          width={w} height={height} role="img" aria-label={ariaLabel}
          style={{ display: 'block', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primary.color} stopOpacity="0.38" />
              <stop offset="100%" stopColor={primary.color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* grid + left axis */}
          {ticks(sc1).map((t, i) => {
            const y = yAt(t, sc1)
            return (
              <g key={i}>
                <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="var(--color-border)" strokeWidth={1} />
                <text x={padL - 6} y={y + 4} textAnchor="end" fontSize={11} style={MUTED}>{compact(t)}</text>
              </g>
            )
          })}
          {/* right axis (second metric) */}
          {sc2 && ticks(sc2).map((t, i) => (
            <text key={i} x={w - padR + 6} y={yAt(t, sc2) + 4} textAnchor="start" fontSize={11}
              style={{ fill: secondary!.color, opacity: 0.85 }}>{compact(t)}</text>
          ))}

          {/* x axis labels */}
          {xLabels.map((l, i) => showX(i) && (
            <text key={i} x={clampX(xAt(i))} y={height - 6} textAnchor="middle" fontSize={11} style={MUTED}>{l}</text>
          ))}

          {/* highlighted column behind the touched bar */}
          {barMode && hover !== null && (
            <rect x={padL + (hover * plotW) / n} y={padT} width={plotW / n} height={plotH} fill="var(--color-surface-3)" opacity={0.6} />
          )}

          {/* main series */}
          {barMode ? (
            primary.values.map((v, i) => {
              const h = yBase - yAt(v, sc1)
              if (h <= 0) return null
              return <rect key={i} x={xAt(i) - bw / 2} y={yAt(v, sc1)} width={bw} height={h} rx={Math.min(3, bw / 2)} fill={primary.color} opacity={hover === null || hover === i ? 1 : 0.55} />
            })
          ) : n > 1 ? (
            <>
              <path d={`${line(primary, sc1)} L${xAt(n - 1).toFixed(1)} ${yBase} L${xAt(0).toFixed(1)} ${yBase} Z`} fill={`url(#${gradId})`} />
              <path d={line(primary, sc1)} fill="none" stroke={primary.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </>
          ) : (
            <circle cx={xAt(0)} cy={yAt(primary.values[0] ?? 0, sc1)} r={4} fill={primary.color} />
          )}

          {/* second metric: always a line on its own axis */}
          {secondary && sc2 && (n > 1 ? (
            <path d={line(secondary, sc2)} fill="none" stroke={secondary.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ) : (
            <circle cx={xAt(0)} cy={yAt(secondary.values[0] ?? 0, sc2)} r={4} fill={secondary.color} />
          ))}

          {/* scrub guide + dots */}
          {hover !== null && (
            <>
              {!barMode && <line x1={xAt(hover)} x2={xAt(hover)} y1={padT} y2={yBase} stroke="var(--color-text-muted)" strokeWidth={1} strokeDasharray="3 3" />}
              {!barMode && <circle cx={xAt(hover)} cy={yAt(primary.values[hover], sc1)} r={4.5} fill={primary.color} stroke="var(--color-bg)" strokeWidth={2} />}
              {secondary && sc2 && <circle cx={xAt(hover)} cy={yAt(secondary.values[hover], sc2)} r={4.5} fill={secondary.color} stroke="var(--color-bg)" strokeWidth={2} />}
            </>
          )}

          {empty && (
            <text x={padL + plotW / 2} y={padT + plotH / 2} textAnchor="middle" fontSize={13} style={MUTED}>
              No activity in this period yet
            </text>
          )}

          {/* touch / mouse surface */}
          <rect
            x={0} y={0} width={w} height={height} fill="transparent"
            onPointerDown={pointFrom}
            onPointerMove={pointFrom}
            onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null) }}
          />
        </svg>
      )}

      {/* tooltip */}
      {w > 0 && hover !== null && (
        <div
          style={{
            position: 'absolute', top: 4, pointerEvents: 'none', zIndex: 2,
            left: Math.min(Math.max(xAt(hover), 78), Math.max(78, w - 78)), transform: 'translateX(-50%)',
            background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-light)', borderRadius: 10,
            padding: '7px 10px', minWidth: 120, boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4, whiteSpace: 'nowrap' }}>{labels[hover]}</div>
          {series.map(s => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--color-text-secondary)' }}>{s.name}</span>
              <strong style={{ marginLeft: 'auto', paddingLeft: 10 }}>{s.format(s.values[hover])}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Donut (share of a whole) ────────────────────────────────────────────────

export interface Slice { label: string; count: number; color: string }

export function Donut({ slices, centerTop, centerBottom }: { slices: Slice[]; centerTop: string; centerBottom: string }) {
  const total = slices.reduce((a, s) => a + s.count, 0)
  const size = 132
  const stroke = 20
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={slices.map(s => `${s.label} ${Math.round((s.count / total) * 100)}%`).join(', ')} style={{ flexShrink: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
        {slices.filter(s => s.count > 0).map(s => {
          const len = (s.count / total) * c
          const el = (
            <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          )
          offset += len
          return el
        })}
        <text x="50%" y="48%" textAnchor="middle" fontSize={20} fontWeight={800} style={{ fill: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif" }}>{centerTop}</text>
        <text x="50%" y="64%" textAnchor="middle" fontSize={11} style={MUTED}>{centerBottom}</text>
      </svg>

      <div style={{ flex: 1, minWidth: 150 }}>
        {slices.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--color-text-primary)' }}>{s.label}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)' }}>{total > 0 ? Math.round((s.count / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Horizontal bars (ranked list) ───────────────────────────────────────────

export function HBars({ items, total, color = 'var(--color-brand)' }: { items: { label: string; count: number }[]; total: number; color?: string }) {
  const max = Math.max(1, ...items.map(i => i.count))
  return (
    <div>
      {items.map(b => {
        const pct = total > 0 ? (b.count / total) * 100 : 0
        return (
          <div key={b.label} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, marginBottom: 5 }}>
              <span style={{ color: 'var(--color-text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</span>
              <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>{pct < 1 && pct > 0 ? '<1' : Math.round(pct)}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: 'var(--color-border)' }}>
              <div style={{ height: '100%', width: `${(b.count / max) * 100}%`, borderRadius: 4, background: color, minWidth: b.count > 0 ? 4 : 0 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Active times heatmap: weekday x 3-hour block ────────────────────────────

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]                    // Monday first
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LONG = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
const BLOCK_LABEL = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p']

export function blockRange(b: number) {
  const f = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h % 24 < 12 ? 'am' : 'pm'}`
  return `${f(b * 3)}-${f(b * 3 + 3)}`
}

/** Sum heat[dow][hour] into 8 three-hour blocks per weekday. */
export function toBlocks(heat: number[][]): number[][] {
  return heat.map(row => Array.from({ length: 8 }, (_, b) => row[b * 3] + row[b * 3 + 1] + row[b * 3 + 2]))
}

export function Heatmap({ blocks }: { blocks: number[][] }) {
  const max = Math.max(1, ...blocks.flat())
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '34px repeat(8, minmax(0, 1fr))', gap: 3, alignItems: 'center' }}>
        <span />
        {BLOCK_LABEL.map(l => (
          <span key={l} style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center' }}>{l}</span>
        ))}
        {DAY_ORDER.map(dow => (
          <FragmentRow key={dow} dow={dow} row={blocks[dow]} max={max} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11, color: 'var(--color-text-muted)' }}>
        <span>Fewer views</span>
        <span style={{ flex: 1, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, var(--color-surface-3), var(--color-brand))' }} />
        <span>More views</span>
      </div>
    </div>
  )
}

function FragmentRow({ dow, row, max }: { dow: number; row: number[]; max: number }) {
  return (
    <>
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{DAY_SHORT[dow]}</span>
      {row.map((v, b) => (
        <span
          key={b}
          title={`${DAY_SHORT[dow]} ${blockRange(b)}: ${v} view${v === 1 ? '' : 's'}`}
          style={{
            height: 26, borderRadius: 5,
            // brand green laid over the neutral cell; stronger = more views (plain rgba works in every webview)
            backgroundColor: 'var(--color-surface-3)',
            backgroundImage: v === 0 ? 'none' : `linear-gradient(rgba(26, 158, 95, ${(0.18 + (v / max) * 0.82).toFixed(2)}), rgba(26, 158, 95, ${(0.18 + (v / max) * 0.82).toFixed(2)}))`,
          }}
        />
      ))}
    </>
  )
}
