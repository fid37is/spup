/* public/sw.js  -  Spup service worker
 *
 * Rebuilt in full (the original was missing from the project). Three jobs:
 *
 *   1. Web Push        - shows a notification for a payload from lib/push/send.ts
 *                        ({ title, body, type, entityId, actorUsername, avatarUrl, path })
 *                        and opens `path` when it is tapped.
 *   2. Offline posts   - Background Sync tag 'retry-posts': sends the posts queued in
 *                        IndexedDB ('spup-offline' / 'pending_posts', see
 *                        lib/offline-post-queue.ts) to /api/posts/sync.
 *   3. Offline app     - app code, images and every signed-in page you open are kept on
 *                        the device, so the app loads with no internet and visited pages
 *                        open. Online always wins (network-first); see the notes below.
 */

// ── 1. Install / activate ───────────────────────────────────────────────────

self.addEventListener('install', () => { self.skipWaiting() })

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Retire older versions of our own caches.
    const names = await caches.keys()
    await Promise.all(names.filter((n) => !OWN.includes(n)).map((n) => caches.delete(n)))
    await self.clients.claim()
  })())
})

// ── 2. Web Push ─────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data ? event.data.text() : '' } }

  const title = data.title || 'Spup'
  const options = {
    body: data.body || '',
    icon: data.avatarUrl || '/icons/icon-192x192.png',   // sender's picture when we have it
    badge: '/icons/icon-96x96.png',
    // One notification per thing: a newer like on the same post replaces the older one.
    tag: data.entityId ? (data.type || 'spup') + ':' + data.entityId : undefined,
    renotify: !!data.entityId,
    data: { path: data.path || '/notifications' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = (event.notification.data && event.notification.data.path) || '/notifications'
  const target = new URL(path, self.location.origin).href

  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (new URL(w.url).origin !== self.location.origin) continue
      await w.focus()
      if ('navigate' in w) { try { await w.navigate(target) } catch { /* fall through: it is focused anyway */ } }
      return
    }
    await self.clients.openWindow(target)
  })())
})

// ── 3. Offline posts (Background Sync) ──────────────────────────────────────

const POST_DB = 'spup-offline'
const POST_STORE = 'pending_posts'

function openPostDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(POST_DB)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(POST_STORE)) db.createObjectStore(POST_STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idb(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(POST_STORE, mode)
    const out = fn(tx.objectStore(POST_STORE))
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined)
    tx.onerror = () => reject(tx.error)
  })
}

async function retryFailedPosts() {
  const db = await openPostDB()
  try {
    const pending = (await idb(db, 'readonly', (s) => s.getAll())) || []
    pending.sort((a, b) => a.createdAt - b.createdAt)
    let transientFailure = false

    for (const post of pending) {
      const form = new FormData()
      if (post.body) form.append('body', post.body)
      form.append('isSelling', String(!!post.isSelling))
      for (const m of post.media || []) form.append('media', m.blob, m.name)

      try {
        const res = await fetch('/api/posts/sync', { method: 'POST', body: form, credentials: 'same-origin' })
        const data = await res.json().catch(() => ({}))
        // Published, or permanently rejected by the word rules: either way never send it again.
        if (data && data.code === 'content_blocked') { await idb(db, 'readwrite', (s) => s.delete(post.id)); continue }
        if (res.ok && !(data && data.error)) { await idb(db, 'readwrite', (s) => s.delete(post.id)); continue }
        transientFailure = true
        await idb(db, 'readwrite', (s) => {
          const g = s.get(post.id)
          g.onsuccess = () => { if (g.result) s.put({ ...g.result, status: 'failed', error: (data && data.error) || 'Sync failed (' + res.status + ')' }) }
        })
      } catch {
        transientFailure = true   // still offline
      }
    }
    // Throwing makes the browser schedule another sync attempt later.
    if (transientFailure) throw new Error('some queued posts could not be sent yet')
  } finally {
    db.close()
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag !== 'retry-posts') return
  // Same Web Lock the page uses, so the page and the worker never send one post twice.
  const run = () => (self.navigator && navigator.locks
    ? navigator.locks.request('spup-offline-post-sync', { ifAvailable: true }, (lock) => (lock ? retryFailedPosts() : undefined))
    : retryFailedPosts())
  event.waitUntil(run())
})

// ── 4. Offline app ──────────────────────────────────────────────────────────
//
//   - App code (/_next/static) and images are kept on the device, so the app shell
//     starts with no connection.
//   - Every signed-in page you open (full load or in-app tap) is saved. Offline, the
//     saved copy opens instead of an error: the app loads and every page you already
//     visited is there. Only brand-new fetches fail.
//   - ONLINE ALWAYS WINS: pages are network-first. The saved copy is used only when the
//     request fails, or when the network hasn't answered in NETWORK_TIMEOUT ms.
//   - Signed out is detected here (any visit to /login, /signup ...): saved pages are
//     wiped, so the next person on the device never sees the previous account's pages.
//   - Cross-origin media (Cloudinary / Bunny / Supabase) is left to the browser's own
//     HTTP cache; caching it here would store opaque responses at a large quota cost.

const SW_V = 'v1'
const PAGES  = 'spup-pages-' + SW_V   // HTML documents
const RSC    = 'spup-rsc-' + SW_V     // in-app navigation payloads
const STATIC = 'spup-static-' + SW_V  // /_next/static (hashed, immutable)
const IMAGES = 'spup-img-' + SW_V     // same-origin images / icons
const OWN = [PAGES, RSC, STATIC, IMAGES]

const NETWORK_TIMEOUT = 6000          // slower than this AND a saved copy exists -> show the saved copy
const MAX_PAGES = 60
const MAX_RSC = 120
const MAX_IMAGES = 150

const APP_PREFIXES = [
  '/feed', '/explore', '/notifications', '/messages', '/post', '/user', '/profile',
  '/connections', '/wallet', '/settings', '/premium', '/compose', '/analytics',
]
const AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-otp', '/verify-email']

const isAppPath = (p) => APP_PREFIXES.some((x) => p === x || p.startsWith(x + '/'))
const isAuthPath = (p) => AUTH_PATHS.some((x) => p === x || p.startsWith(x + '/'))

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'spup:clear-caches') event.waitUntil(clearUserCaches())
})

function clearUserCaches() {
  return Promise.all([caches.delete(PAGES), caches.delete(RSC)])
}

async function trim(name, max) {
  const c = await caches.open(name)
  const keys = await c.keys()
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => c.delete(k)))
}

async function store(name, key, res, max) {
  const c = await caches.open(name)
  await c.put(key, res)
  await trim(name, max)
}

function markStale(res) {
  const h = new Headers(res.headers)
  h.set('X-Spup-Stale', '1')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
}

function tellClientsStale() {
  self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'spup:stale' })))
}

function rscKey(url) {
  const u = new URL(url.href)
  u.searchParams.delete('_rsc')
  return u.href
}

// Network first. Resolves with:
//   { fresh }  the live response (also saved for next time)
//   { stale }  the saved copy - because the request failed, or took longer than NETWORK_TIMEOUT
//   { none }   request failed and nothing is saved
function networkFirst(event, cacheName, key, max) {
  const req = event.request
  const net = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') event.waitUntil(store(cacheName, key, res.clone(), max))
    return res
  })
  const saved = caches.open(cacheName).then((c) => c.match(key, { ignoreVary: true }))

  return new Promise((resolve) => {
    let done = false
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v) } }
    const timer = setTimeout(async () => {
      const c = await saved
      if (c) finish({ stale: c })          // no saved copy: keep waiting for the network
    }, NETWORK_TIMEOUT)
    net.then(
      (res) => finish({ fresh: res }),
      async () => { const c = await saved; finish(c ? { stale: c } : { none: true }) },
    )
  })
}

const OFFLINE_HTML = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Spup</title><body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
  'background:#0A0A0A;color:#F5F5F0;font-family:system-ui,sans-serif;text-align:center;padding:24px">' +
  '<h1 style="font-size:24px;margin:0 0 10px">You\'re offline</h1>' +
  '<p style="color:#8A8A80;max-width:300px;line-height:1.6;margin:0 0 24px">This page hasn\'t been opened on this device yet, so there\'s no saved copy. Pages you\'ve already visited still open.</p>' +
  '<button onclick="location.reload()" style="background:#1A7A4A;color:#fff;border:0;border-radius:24px;padding:12px 30px;font-size:15px;font-weight:600">Try again</button>' +
  '<script>addEventListener("online",function(){location.reload()})</script>'

async function pageFallback() {
  const c = await caches.open(PAGES)
  const feed = await c.match('/feed', { ignoreSearch: true, ignoreVary: true })
  if (feed) return markStale(feed)
  return new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

async function cacheFirst(event, name) {
  const c = await caches.open(name)
  const hit = await c.match(event.request)
  if (hit) return hit
  const res = await fetch(event.request)
  if (res.ok && res.type === 'basic') event.waitUntil(c.put(event.request, res.clone()))
  return res
}

async function staleWhileRevalidate(event, name, max) {
  const c = await caches.open(name)
  const hit = await c.match(event.request)
  const net = fetch(event.request)
    .then((res) => { if (res.ok && res.type === 'basic') return store(name, event.request.url, res.clone(), max) })
    .catch(() => {})
  event.waitUntil(net)
  if (hit) return hit
  try { return await fetch(event.request) } catch { return Response.error() }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  const path = url.pathname

  // Signed out (or about to sign in): drop the previous account's saved pages.
  if (isAuthPath(path) && (req.mode === 'navigate' || req.headers.get('RSC') === '1')) {
    event.waitUntil(clearUserCaches())
    return
  }

  if (path.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(event, STATIC).catch(() => Response.error()))
    return
  }
  if (path.startsWith('/_next/image') || /\.(?:png|jpe?g|gif|webp|svg|ico)$/i.test(path)) {
    event.respondWith(staleWhileRevalidate(event, IMAGES, MAX_IMAGES))
    return
  }

  // In-app navigation (tap a tab / link): Next fetches the page as an RSC payload.
  if (req.headers.get('RSC') === '1' && isAppPath(path)) {
    if (req.headers.has('Next-Router-Prefetch') || req.headers.has('Next-Router-Segment-Prefetch')) return
    event.respondWith((async () => {
      const r = await networkFirst(event, RSC, rscKey(url), MAX_RSC)
      if (r.fresh) return r.fresh
      if (r.stale) { tellClientsStale(); return markStale(r.stale) }
      // Nothing saved: fail the fetch. Next then falls back to a normal page load,
      // which the navigation handler below answers from the saved HTML.
      return Response.error()
    })())
    return
  }

  // Full page load (cold start, reload, link from outside).
  if (req.mode === 'navigate' && (isAppPath(path) || path === '/')) {
    event.respondWith((async () => {
      const r = await networkFirst(event, PAGES, req.url, MAX_PAGES)
      if (r.fresh) return r.fresh
      if (r.stale) return markStale(r.stale)
      return pageFallback()
    })())
  }
})
