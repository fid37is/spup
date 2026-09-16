    // src/components/explore/matchday-strip.tsx
//
// Horizontal strip of match score cards shown just under the Explore tab
// bar. Presentational only — data comes from lib/queries/matchday.ts.

import type { MatchdayFixture } from '@/lib/queries/matchday'

function statusLabel(f: MatchdayFixture): { text: string; live: boolean } {
  if (f.status === 'FINISHED') return { text: 'Final', live: false }
  if (f.status === 'PAUSED') return { text: 'HT', live: true }
  if (f.status === 'LIVE' || f.status === 'IN_PLAY') {
    return { text: f.minute ? `${f.minute}'` : 'Live', live: true }
  }
  // Scheduled/timed — show kickoff time
  const t = new Date(f.utcDate).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return { text: t, live: false }
}

function dateLabel(utcDate: string): string {
  return new Date(utcDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function TeamRow({ code, crest, score }: { code: string; crest: string | null; score: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          background: 'var(--color-surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {crest ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={crest} alt={code} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--color-text-muted)' }}>{code.slice(0, 1)}</span>
          )}
        </div>
        <span style={{
          fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)',
          fontFamily: "'Syne', sans-serif", whiteSpace: 'nowrap',
        }}>
          {code}
        </span>
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text-primary)', flexShrink: 0 }}>
        {score ?? '-'}
      </span>
    </div>
  )
}

function MatchCard({ fixture }: { fixture: MatchdayFixture }) {
  const status = statusLabel(fixture)
  return (
    <div style={{
      minWidth: 148, flexShrink: 0,
      background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
      borderRadius: 12, padding: '10px 12px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 11, marginBottom: 8,
      }}>
        <span style={{
          fontWeight: 700, color: status.live ? '#E0245E' : 'var(--color-text-secondary)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {status.live && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E0245E', display: 'inline-block' }} />
          )}
          {status.text}
        </span>
        <span style={{ color: 'var(--color-text-faint)' }}>{dateLabel(fixture.utcDate)}</span>
      </div>
      <TeamRow code={fixture.homeTeam.code} crest={fixture.homeTeam.crest} score={fixture.homeScore} />
      <TeamRow code={fixture.awayTeam.code} crest={fixture.awayTeam.crest} score={fixture.awayScore} />
    </div>
  )
}

export default function MatchdayStrip({ fixtures }: { fixtures: MatchdayFixture[] }) {
  if (!fixtures.length) return null
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '12px 20px',
      overflowX: 'auto', borderBottom: '1px solid var(--color-border)',
      scrollbarWidth: 'none', msOverflowStyle: 'none',
    }}>
      {fixtures.map(f => <MatchCard key={f.id} fixture={f} />)}
    </div>
  )
}