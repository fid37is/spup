#!/usr/bin/env node
// scripts/bunny-make-posters.mjs
//
// Your old video posters were frames that Cloudinary generated on the fly from the
// video, so they were never files in your export and are missing on Bunny. This
// recreates them: for each video post whose poster is missing, it takes the first
// frame of the video (what Cloudinary's "so_0" did), scales it to at most 720px wide,
// and uploads it to Bunny under the SAME file name the database already expects
// (<id>.jpg). So the normal bunny-verify.mjs + rewrite.sql step then picks them up
// with no special handling.
//
// It only ADDS files. It never overwrites, never deletes, never touches the database.
//
// Needs ffmpeg installed on the machine you run it on (ffmpeg -version should work).
// Run from the project root (Node 18+), first as a preview:
//
//   node scripts/bunny-make-posters.mjs db-urls.json --dry-run     (no password needed)
//   node scripts/bunny-make-posters.mjs db-urls.json                (asks for the password)
//
// The zone password is asked for when the script starts uploading (typing is hidden),
// or taken from BUNNY_STORAGE_ACCESS_KEY if you set it. Never put it in this file.
// Optional: BUNNY_STORAGE_ZONE (spup-storage), BUNNY_STORAGE_ENDPOINT
// (storage.bunnycdn.com), BUNNY_CDN_BASE (https://cdn.spup.live).

import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ZONE = process.env.BUNNY_STORAGE_ZONE || 'spup-storage'
const ENDPOINT = (process.env.BUNNY_STORAGE_ENDPOINT || 'storage.bunnycdn.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
const STORAGE = process.env.BUNNY_STORAGE_BASE_URL || `https://${ENDPOINT}`     // override is for testing only
const CDN = (process.env.BUNNY_CDN_BASE || 'https://cdn.spup.live').replace(/\/+$/, '')
let KEY = process.env.BUNNY_STORAGE_ACCESS_KEY
const input = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'))
const DRY = process.argv.includes('--dry-run')
const CONCURRENCY = 2          // ffmpeg is heavy; two at a time is plenty

if (!input) { console.error('Usage: node scripts/bunny-make-posters.mjs db-urls.json [--dry-run]'); process.exit(1) }

// Asks for the zone password at the keyboard (typing is hidden) when it was not
// already provided in BUNNY_STORAGE_ACCESS_KEY. Nothing is saved anywhere.
async function askPassword() {
  const { createInterface } = await import('node:readline')
  const question = 'Bunny zone password (typing is hidden): '
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY })
    rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(s) }   // show the prompt, not the keystrokes
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer.trim()) })
  })
}

// ---------- read the export (same file bunny-verify.mjs reads) ----------
function parseCsv(text) {
  const rows = []
  let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ } else if (ch === '"') q = false; else field += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; if (row.some(c => c !== '')) rows.push(row); row = [] }
    else field += ch
  }
  row.push(field)
  if (row.some(c => c !== '')) rows.push(row)
  return rows
}
function readRows(path) {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
  if (path.toLowerCase().endsWith('.json')) return JSON.parse(text).map(r => ({ source: r.source, row_id: String(r.row_id), old_url: r.old_url }))
  const [h, ...b] = parseCsv(text)
  const i = n => h.findIndex(x => x.trim().toLowerCase() === n)
  return b.map(r => ({ source: r[i('source')], row_id: r[i('row_id')], old_url: r[i('old_url')] }))
}
const nameOf = url => { try { return new URL(url).pathname.split('/').pop() || null } catch { return null } }

// ---------- ffmpeg ----------
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', d => { err = (err + d).slice(-400) })
    p.on('error', reject)
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.trim().split('\n').pop()}`)))
  })
}
try { await run('ffmpeg', ['-version']) } catch {
  console.error('ffmpeg was not found. Install it first (https://ffmpeg.org/download.html), then run this again.')
  process.exit(1)
}

// ---------- work out which posters are needed ----------
const rows = readRows(input)
const video = new Map()    // post_media id -> video file name
const poster = new Map()   // post_media id -> poster file name the database expects
for (const r of rows) {
  if (r.source === 'post_media.url') video.set(r.row_id, nameOf(r.old_url))
  if (r.source === 'post_media.thumbnail_url') poster.set(r.row_id, nameOf(r.old_url))
}
const jobs = [...poster].map(([id, posterName]) => ({ id, posterName, videoName: video.get(id) })).filter(j => j.posterName)

const exists = async name => (await fetch(`${CDN}/${encodeURIComponent(name)}`, { method: 'HEAD' }).catch(() => null))?.status === 200

const needed = []
const skipped = { already: 0, noVideo: [], videoMissing: [] }
for (const j of jobs) {
  if (await exists(j.posterName)) { skipped.already++; continue }
  if (!j.videoName) { skipped.noVideo.push(j); continue }
  if (!(await exists(j.videoName))) { skipped.videoMissing.push(j); continue }
  needed.push(j)
}
console.log(`${jobs.length} video posters in the database: ${skipped.already} already on Bunny, ${needed.length} to make, ${skipped.videoMissing.length} skipped (the video itself is not on Bunny), ${skipped.noVideo.length} skipped (no video link on that row)`)
if (DRY) {
  for (const j of needed.slice(0, 15)) console.log(`  would make  ${j.posterName}  from  ${j.videoName}`)
  if (needed.length > 15) console.log(`  ... and ${needed.length - 15} more`)
  console.log('\nPreview only: nothing was created or uploaded.')
  process.exit(0)
}

// ---------- make and upload ----------
if (needed.length && !KEY) {
  KEY = await askPassword()
  if (!KEY) { console.error('No password entered. Nothing was uploaded.'); process.exit(1) }
}
const tmp = mkdtempSync(join(tmpdir(), 'spup-posters-'))
const out = { made: 0, failed: [] }
let next = 0

async function work(j) {
  const src = join(tmp, `${j.id}-in`), dst = join(tmp, `${j.id}.jpg`)
  try {
    const dl = await fetch(`${CDN}/${encodeURIComponent(j.videoName)}`)
    if (!dl.ok) throw new Error(`download HTTP ${dl.status}`)
    writeFileSync(src, Buffer.from(await dl.arrayBuffer()))
    // First frame, at most 720px wide, never enlarged (like Cloudinary's w_720,c_limit).
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0', '-i', src, '-frames:v', '1',
      '-vf', "scale='min(720,iw)':-2", '-q:v', '4', dst])
    const jpg = readFileSync(dst)
    const up = await fetch(`${STORAGE}/${ZONE}/${encodeURIComponent(j.posterName)}`, {
      method: 'PUT', headers: { AccessKey: KEY, 'Content-Type': 'image/jpeg' }, body: jpg,
    })
    if (!up.ok) throw new Error(`Bunny upload ${up.status}`)
    out.made++
    console.log(`  made  ${j.posterName}  (${(jpg.length / 1024).toFixed(0)} KB)`)
  } catch (e) {
    out.failed.push({ ...j, why: e.message })
    console.log(`  FAILED  ${j.posterName}  - ${e.message}`)
  } finally {
    rmSync(src, { force: true }); rmSync(dst, { force: true })
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < needed.length) await work(needed[next++])
}))
rmSync(tmp, { recursive: true, force: true })

console.log(`\nPosters made and uploaded: ${out.made}    failed: ${out.failed.length}`)
if (out.failed.length) console.log('Run it again to retry the failed ones (finished ones are skipped).')
console.log('Next: re-run  node scripts/bunny-verify.mjs db-urls.json  to refresh rewrite.sql.')
