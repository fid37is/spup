#!/usr/bin/env node
// scripts/bunny-copy-missing.mjs
//
// Copies the files that bunny-verify.mjs found missing on Bunny from Cloudinary to
// Bunny, using the same layout as your first migration (the file sits at the root of
// the storage zone under its own name). Video thumbnails are skipped: they were never
// real files (see bunny-make-posters.mjs).
//
// It only ADDS files. It skips anything already on the CDN, never overwrites, never
// deletes, and never touches the database.
//
// Run from the project root (Node 18+), first as a preview:
//
//   node scripts/bunny-copy-missing.mjs --dry-run      (no password needed)
//   node scripts/bunny-copy-missing.mjs                (asks for the password)
//
// Input: bunny-missing.csv (written by bunny-verify.mjs).
// The zone password is asked for when the script starts uploading (typing is hidden),
// or taken from BUNNY_STORAGE_ACCESS_KEY if you set it. Never put it in this file.
//
// Optional: BUNNY_STORAGE_ZONE (spup-storage), BUNNY_STORAGE_ENDPOINT
// (storage.bunnycdn.com), BUNNY_CDN_BASE (https://cdn.spup.live), MISSING_CSV.

import { readFileSync } from 'node:fs'

const ZONE = process.env.BUNNY_STORAGE_ZONE || 'spup-storage'
const ENDPOINT = (process.env.BUNNY_STORAGE_ENDPOINT || 'storage.bunnycdn.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
const STORAGE = process.env.BUNNY_STORAGE_BASE_URL || `https://${ENDPOINT}`     // override is for testing only
const CDN = (process.env.BUNNY_CDN_BASE || 'https://cdn.spup.live').replace(/\/+$/, '')
let KEY = process.env.BUNNY_STORAGE_ACCESS_KEY
const FILE = process.env.MISSING_CSV || 'bunny-missing.csv'
const DRY = process.argv.includes('--dry-run')


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

const TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/mp4',
}

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

const [header, ...body] = parseCsv(readFileSync(FILE, 'utf8').replace(/^\uFEFF/, ''))
const col = n => header.findIndex(h => h.trim().toLowerCase() === n)
const [cSource, cRow, cOld, cStatus] = [col('source'), col('row_id'), col('old_url'), col('status')]
if ([cSource, cRow, cOld, cStatus].some(i => i < 0)) { console.error(`${FILE} is not a bunny-missing.csv`); process.exit(1) }

const todo = body
  .map(r => ({ source: r[cSource], row: r[cRow], url: r[cOld], status: r[cStatus] }))
  .filter(r => r.source !== 'post_media.thumbnail_url' && r.status === '404')

const nameOf = url => { try { return new URL(url).pathname.split('/').pop() || null } catch { return null } }

console.log(`${todo.length} missing files to copy${DRY ? '  (preview only, nothing will be uploaded)' : ''}\n`)
if (!DRY && !KEY) {
  KEY = await askPassword()
  if (!KEY) { console.error('No password entered. Nothing was uploaded.'); process.exit(1) }
}

const result = { copied: 0, already: 0, gone: [], failed: [] }

for (const r of todo) {
  const name = nameOf(r.url)
  if (!name) { result.failed.push({ ...r, why: 'no file name in link' }); continue }

  // Skip if it is already on the CDN (safe to re-run).
  const have = await fetch(`${CDN}/${encodeURIComponent(name)}`, { method: 'HEAD' }).catch(() => null)
  if (have?.status === 200) { result.already++; console.log(`  already on Bunny   ${name}`); continue }

  // Fetch the original from Cloudinary.
  let src
  try { src = await fetch(r.url) } catch (e) { result.failed.push({ ...r, why: 'could not reach Cloudinary: ' + e.message }); console.log(`  FAILED (network)   ${name}`); continue }
  if (src.status === 404 || src.status === 401 || src.status === 403) {
    result.gone.push({ ...r, why: `Cloudinary answers ${src.status}` })
    console.log(`  not on Cloudinary  ${name}  (${r.source}, row ${r.row})`)
    continue
  }
  if (!src.ok) { result.failed.push({ ...r, why: `Cloudinary HTTP ${src.status}` }); console.log(`  FAILED (${src.status})      ${name}`); continue }

  if (DRY) { console.log(`  would copy         ${name}  (${(Number(src.headers.get('content-length')) / 1024).toFixed(0)} KB)`); await src.body?.cancel(); result.copied++; continue }

  const ext = name.split('.').pop().toLowerCase()
  const type = TYPES[ext] || (src.headers.get('content-type') || 'application/octet-stream').split(';')[0]
  const data = Buffer.from(await src.arrayBuffer())
  const up = await fetch(`${STORAGE}/${ZONE}/${encodeURIComponent(name)}`, {
    method: 'PUT', headers: { AccessKey: KEY, 'Content-Type': type }, body: data,
  }).catch(e => ({ ok: false, status: e.message }))
  if (up.ok) { result.copied++; console.log(`  copied             ${name}  (${(data.length / 1024).toFixed(0)} KB)`) }
  else { result.failed.push({ ...r, why: `Bunny upload ${up.status}` }); console.log(`  FAILED (Bunny ${up.status}) ${name}`) }
}

console.log(`\n${DRY ? 'Would copy' : 'Copied'}: ${result.copied}    already there: ${result.already}    not on Cloudinary either: ${result.gone.length}    failed: ${result.failed.length}`)
if (result.gone.length) {
  console.log('\nThese files no longer exist on Cloudinary, so they cannot be recovered from there.')
  console.log('Their posts / avatars already show broken media. Rows:')
  for (const g of result.gone) console.log(`  ${g.source.padEnd(18)} row ${g.row}  ${nameOf(g.url)}`)
}
if (result.failed.length) {
  console.log('\nFailed (run again to retry):')
  for (const f of result.failed) console.log(`  ${f.source.padEnd(18)} row ${f.row}  ${nameOf(f.url)}  - ${f.why}`)
}
if (!DRY && result.copied) console.log('\nNow re-run:  node scripts/bunny-verify.mjs db-urls.json   to refresh rewrite.sql.')
