/**
 * queries/matchday.ts
 * --------------------
 * Live/recent football scores for the score-card strip at the top of
 * Explore (mirrors the "Live on X" match cards under X's own Explore tabs).
 *
 * Backed by football-data.org (https://www.football-data.org) — the free
 * tier covers the big European competitions (EPL, Championship, Champions
 * League, etc.), which is what a Nigerian audience mostly follows.
 *
 * Set MATCHDAY_API_KEY in .env.local to enable this. Without it — or if the
 * request fails for any reason — this returns [] and the strip simply
 * doesn't render. It's a nice-to-have widget, never a hard dependency for
 * the rest of the page.
 */

export interface MatchdayFixture {
  id: number
  status: 'SCHEDULED' | 'LIVE' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | string
  utcDate: string
  minute: number | null
  competition: string
  homeTeam: { code: string; crest: string | null }
  awayTeam: { code: string; crest: string | null }
  homeScore: number | null
  awayScore: number | null
}

const API_BASE = 'https://api.football-data.org/v4'

// "Manchester United FC" -> "MAN", "Leeds United FC" -> "LEE" — 3-letter
// club codes to match the reference design. Falls back to the team's own
// tla (three-letter abbreviation) from the API when it's more sensible
// than a naive slice (e.g. "Nott'm Forest" -> "NFO" not "NOT").
function shortCode(name: string, tla?: string): string {
  if (tla && tla.length === 3) return tla.toUpperCase()
  const clean = name.replace(/\bFC\b|\bAFC\b|\bCF\b/gi, '').trim()
  return clean.slice(0, 3).toUpperCase()
}

export async function getMatchdayFixtures(): Promise<MatchdayFixture[]> {
  const apiKey = process.env.MATCHDAY_API_KEY
  if (!apiKey) return []

  const today = new Date()
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  try {
    const res = await fetch(
      `${API_BASE}/matches?dateFrom=${fmt(yesterday)}&dateTo=${fmt(tomorrow)}`,
      {
        headers: { 'X-Auth-Token': apiKey },
        // Scores move; 3 min is fresh enough without hammering the free
        // tier's rate limit (10 req/min).
        next: { revalidate: 180 },
      }
    )
    if (!res.ok) return []

    const json = await res.json()
    const matches = (json.matches || []) as any[]

    return matches
      .filter(m => ['LIVE', 'IN_PLAY', 'PAUSED', 'FINISHED', 'SCHEDULED', 'TIMED'].includes(m.status))
      // Live/in-progress first, then most recently finished, then upcoming
      .sort((a, b) => {
        const rank = (s: string) => (['LIVE', 'IN_PLAY', 'PAUSED'].includes(s) ? 0 : s === 'FINISHED' ? 1 : 2)
        return rank(a.status) - rank(b.status)
      })
      .slice(0, 12)
      .map(m => ({
        id: m.id,
        status: m.status,
        utcDate: m.utcDate,
        minute: m.minute ?? null,
        competition: m.competition?.name ?? '',
        homeTeam: {
          code: shortCode(m.homeTeam?.shortName ?? m.homeTeam?.name ?? '', m.homeTeam?.tla),
          crest: m.homeTeam?.crest ?? null,
        },
        awayTeam: {
          code: shortCode(m.awayTeam?.shortName ?? m.awayTeam?.name ?? '', m.awayTeam?.tla),
          crest: m.awayTeam?.crest ?? null,
        },
        homeScore: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null,
        awayScore: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null,
      }))
  } catch {
    return []
  }
}