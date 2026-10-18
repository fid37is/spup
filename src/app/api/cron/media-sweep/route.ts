import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { listBunny, deleteFromBunny, publicUrl } from '@/lib/storage/bunny'
import { findReferencedUrls } from '@/lib/storage/media-references'

// Finds files in storage that nothing on Spup uses any more and (optionally) deletes them:
//   - files from posts their author deleted before deletes started removing media
//   - files uploaded but never posted (removed in the composer, abandoned, cancelled uploads)
// It looks only inside para/<account>/posts/, and only at files older than min_age_days.
//
// DRY RUN BY DEFAULT - it reports what it would delete and deletes nothing:
//   curl -H "Authorization: Bearer $CRON_SECRET" "https://spup.live/api/cron/media-sweep"
// When the numbers look right, add apply=1. Each call covers `users` accounts (default 25);
// repeat with the returned next_offset until it is null:
//   curl -H "Authorization: Bearer $CRON_SECRET" "https://spup.live/api/cron/media-sweep?apply=1&offset=25"
//
// Options: apply=1  min_age_days=7  users=25  offset=0  force=1
//
// Two safeguards:
//   - min_age_days: a saved draft keeps its uploaded files only in the person's browser, which the
//     server cannot see, so a file is left alone until it is at least this old (default 7 days).
//     A draft older than that can lose its attached photos.
//   - Posts still pointing at Cloudinary (not yet moved to Bunny) make an apply run refuse
//     with 409, because their files may sit in storage under a name the sweep cannot match.
//     Pass force=1 only if you have checked that.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const num = (v: string | null, d: number, min: number, max: number) => {
  const n = Number(v); return Number.isFinite(n) && v !== null && v !== '' ? Math.min(max, Math.max(min, Math.floor(n))) : d
}
// Bunny reports times in UTC without a zone suffix.
const ts = (s: string) => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z')

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const q = new URL(request.url).searchParams
  const apply = q.get('apply') === '1'
  const force = q.get('force') === '1'
  const minAgeDays = num(q.get('min_age_days'), 7, 1, 365)
  const batch = num(q.get('users'), 25, 1, 100)
  const offset = num(q.get('offset'), 0, 0, 1_000_000)
  const cutoff = Date.now() - minAgeDays * 24 * 60 * 60 * 1000
  const admin = createAdminClient()

  try {
    if (apply && !force) {
      const { count, error } = await admin.from('post_media').select('id', { count: 'exact', head: true }).like('url', '%res.cloudinary.com%')
      if (error) throw new Error(error.message)
      if ((count ?? 0) > 0) {
        return NextResponse.json({
          error: `${count} post media rows still point at Cloudinary. Finish the move to Bunny first, or pass force=1 after checking.`,
        }, { status: 409 })
      }
    }

    const top = await listBunny('para')
    if (!top) return NextResponse.json({ error: 'Could not list storage. Check BUNNY_STORAGE_ACCESS_KEY.' }, { status: 502 })
    const accounts = top.filter(e => e.isDirectory).map(e => e.name).sort()
    const slice = accounts.slice(offset, offset + batch)

    let scannedFiles = 0, orphanFiles = 0, orphanBytes = 0, deleted = 0, failed = 0, skippedListings = 0
    const sample: string[] = []

    for (const account of slice) {
      const entries = await listBunny(`para/${account}/posts`)
      if (!entries) { skippedListings++; continue }          // unknown is not empty: touch nothing
      const files = entries.filter(e => !e.isDirectory && ts(e.created) <= cutoff)
      scannedFiles += files.length
      if (files.length === 0) continue

      const paths = files.map(f => `para/${account}/posts/${f.name}`)
      const inUse = await findReferencedUrls(admin, paths.map(publicUrl))   // throws on error -> nothing deleted
      const orphans = files.filter((_, i) => !inUse.has(publicUrl(paths[i])))
      orphanFiles += orphans.length
      orphanBytes += orphans.reduce((n, f) => n + f.size, 0)
      for (const f of orphans) if (sample.length < 20) sample.push(`para/${account}/posts/${f.name}`)

      if (apply) {
        for (let i = 0; i < orphans.length; i += 5) {
          const results = await Promise.all(orphans.slice(i, i + 5).map(f => deleteFromBunny(`para/${account}/posts/${f.name}`)))
          for (const ok of results) ok ? deleted++ : failed++
        }
      }
    }

    const next = offset + batch < accounts.length ? offset + batch : null
    return NextResponse.json({
      dry_run: !apply, min_age_days: minAgeDays,
      accounts_total: accounts.length, accounts_scanned: slice.length, next_offset: next,
      files_checked: scannedFiles, orphan_files: orphanFiles, orphan_mb: Math.round(orphanBytes / 1048576 * 10) / 10,
      deleted, failed, listings_skipped: skippedListings, sample,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('media-sweep failed:', err)
    return NextResponse.json({ error: 'Sweep stopped without deleting anything further. See server logs.' }, { status: 500 })
  }
}
