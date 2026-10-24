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
//   - Every page you open - a full load OR an in-app tap, on ANY route, not just a fixed
//     list - is saved. Offline, the saved copy opens instead of an error. Only brand-new
//     pages (never opened on this device) fail.
//   - ONLINE ALWAYS WINS: pages are network-first. The saved copy is used only when the
//     request fails, or when the network hasn't answered in NETWORK_TIMEOUT ms.
//   - A tap inside the app is saved as an "RSC payload" (what Next fetches for a soft
//     navigation). That cannot be opened by a reload / cold start, so the first time a page
//     is reached that way the worker ALSO quietly saves its full HTML in the background
//     (see warmPage) - then the page opens offline however you get to it.
//   - Only a REAL answer is ever saved. A redirect (e.g. the server bouncing to /login because
//     Supabase was briefly unreachable) or a non-page response is never stored under the
//     page's address, so a bad moment online cannot poison the saved copy.
//   - Saved pages are wiped only when the person signs out (/login?signed_out=1) or a
//     DIFFERENT account signs in on this device (the page tells us who is signed in via
//     'spup:user'). Merely landing on /login - an expired session, a slow server - no longer
//     throws away everything that was saved.
//   - Photos and avatars from our CDNs (Bunny / Cloudinary / Supabase storage) are kept too,
//     so a visited page does not come back with blank pictures. They are fetched with CORS
//     so the saved copy is a real response with its real size (an opaque one is counted as
//     ~7 MB by the browser's quota). A host that sends no CORS headers is detected and
//     simply left to the browser's HTTP cache. Videos are never kept.

const SW_V = 'v2'
const PAGES  = 'spup-pages-' + SW_V   // HTML documents
const RSC    = 'spup-rsc-' + SW_V     // in-app navigation payloads
const STATIC = 'spup-static-' + SW_V  // /_next/static (hashed, immutable)
const IMAGES = 'spup-img-' + SW_V     // same-origin images / icons
const MEDIA  = 'spup-media-' + SW_V   // post photos, avatars, thumbnails from our CDNs
const META   = 'spup-meta-' + SW_V    // who the saved pages belong to
const OWN = [PAGES, RSC, STATIC, IMAGES, MEDIA, META]

const NETWORK_TIMEOUT = 6000          // slower than this AND a saved copy exists -> show the saved copy
const MAX_PAGES = 120
const MAX_RSC = 200
const MAX_IMAGES = 150
const MAX_MEDIA = 300                  // entries
const MAX_MEDIA_BYTES = 1.5 * 1024 * 1024   // a single photo bigger than this is shown but not kept
const MEDIA_REVALIDATE_MS = 24 * 60 * 60 * 1000
const WARM_REFRESH_MS = 12 * 60 * 60 * 1000 // a background-saved page is re-saved at most this often
const MAX_STATIC_WARM = 250
// Opening the app on /feed shows the saved feed AT ONCE, then fetches the real page and tells the
// page to raise the "N new posts" pill. Only for a quick return - this is the same 10 minutes as
// SNAPSHOT_MAX_AGE_MS in feed-client.tsx, because anything older must start from a fresh feed
// (people were being shown days-old posts first). Older than this, /feed loads normally.
const INSTANT_FEED_MAX_AGE_MS = 10 * 60 * 1000

// The admin site (admin.spup.live) is its own origin with its own copy of this worker; there
// "/" is the dashboard and is worth keeping. On the main site "/" is the landing page for
// signed-out visitors and a redirect to /feed for everyone else - never worth keeping.
const IS_ADMIN_HOST = self.location.hostname.startsWith('admin.')

// Everything that is NOT a page worth saving. (This used to be an allow-list of app
// sections, which silently left out any page that wasn't on it.)
const NEVER_CACHE_PREFIXES = [
  '/api/', '/_next/', '/offline',
  '/login', '/signup', '/forgot-password', '/reset-password', '/verify-otp', '/verify-email',
  '/complete-profile', '/onboarding', '/banned', '/deletion-status', '/l/',
]
const NEVER_CACHE_EXACT = ['/sw.js', '/manifest.json', '/robots.txt', '/sitemap.xml']
// Chat threads have their own on-device cache (lib/chat-thread-cache) - don't also render
// each one a second time just to keep its HTML.
const NO_WARM_PREFIXES = ['/messages/']
const AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-otp', '/verify-email']

const matchesPrefix = (p, list) => list.some((x) => p === x || p.startsWith(x.endsWith('/') ? x : x + '/'))
const isAuthPath = (p) => matchesPrefix(p, AUTH_PATHS)

function isCacheablePage(p) {
  if (p === '/') return IS_ADMIN_HOST
  if (NEVER_CACHE_EXACT.includes(p)) return false
  if (/\.[a-z0-9]{2,5}$/i.test(p)) return false          // a file, not a page
  return !matchesPrefix(p, NEVER_CACHE_PREFIXES)
}

self.addEventListener('message', (event) => {
  const d = event.data
  if (!d || typeof d !== 'object') return
  if (d.type === 'spup:clear-caches') event.waitUntil(clearUserCaches())
  else if (d.type === 'spup:user' && typeof d.userId === 'string') event.waitUntil(setCurrentUser(d.userId))
  else if (d.type === 'spup:cache-urls' && Array.isArray(d.urls)) event.waitUntil(warmStatic(d.urls))
  else if (d.type === 'spup:feed-check' && event.ports && event.ports[0]) {
    // The feed page asks: "was I opened from the saved copy, and has the real page arrived?"
    const port = event.ports[0]
    event.waitUntil((feedRevalidation || Promise.resolve('none')).then((r) => port.postMessage(r)))
  }
})

function clearUserCaches() {
  return Promise.all([caches.delete(PAGES), caches.delete(RSC), caches.delete(META)])
}

// The page tells us who is signed in. If it is a different person from whoever the saved pages
// were made for, those pages are not theirs: drop them before they can be shown.
async function setCurrentUser(userId) {
  const meta = await caches.open(META)
  const prev = await meta.match('/__user')
  const prevId = prev ? await prev.text() : null
  if (prevId === userId) return
  if (prevId) await Promise.all([caches.delete(PAGES), caches.delete(RSC)])
  await (await caches.open(META)).put('/__user', new Response(userId))
}

// Page code / fonts / styles that were already loaded BEFORE this worker took control of the
// page (the very first visit) never passed through it. The page lists them and we save them
// now - normally straight from the browser's own HTTP cache, no extra download.
async function warmStatic(urls) {
  const c = await caches.open(STATIC)
  let n = 0
  for (const raw of urls) {
    if (n >= MAX_STATIC_WARM) break
    let u
    try { u = new URL(raw, self.location.origin) } catch { continue }
    if (u.origin !== self.location.origin || !u.pathname.startsWith('/_next/static/')) continue
    n++
    try {
      if (await c.match(u.href)) continue
      const res = await fetch(u.href)
      if (res.ok && res.type === 'basic') await c.put(u.href, res)
    } catch { /* offline right now - the next page load will try again */ }
  }
}

async function trim(name, max) {
  const c = await caches.open(name)
  const keys = await c.keys()
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => c.delete(k)))
}

async function store(name, key, res, max, stamp) {
  const c = await caches.open(name)
  if (stamp) {
    // Remember WHEN this copy was saved, so a background refresh knows how old it is.
    const h = new Headers(res.headers)
    h.set('X-Spup-Cached-At', String(Date.now()))
    res = new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h })
  }
  await c.put(key, res)
  await trim(name, max)
}

// Is this a genuine answer for this kind of request - worth keeping under the page's address?
// A redirect is NOT: fetch() follows it silently, so a bounce to /login would otherwise be
// saved as if it were the page itself.
function isGenuine(res, kind) {
  if (!res.ok || res.type !== 'basic' || res.redirected) return false
  const ct = (res.headers.get('Content-Type') || '').toLowerCase()
  return kind === 'rsc' ? ct.startsWith('text/x-component') : ct.startsWith('text/html')
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
function networkFirst(event, cacheName, key, max, kind) {
  const req = event.request
  let saving = Promise.resolve()
  const net = fetch(req).then((res) => {
    if (isGenuine(res, kind)) saving = store(cacheName, key, res.clone(), max, kind === 'html').catch(() => {})
    return res
  })
  // Registered now, while the event is still alive: when the saved copy wins the race the
  // slow network answer still lands in the cache for next time.
  event.waitUntil(net.then(() => saving, () => {}))
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

function offlineHtml(canGoToFeed) {
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Spup</title><body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'background:#0A0A0A;color:#F5F5F0;font-family:system-ui,sans-serif;text-align:center;padding:24px">' +
    '<h1 style="font-size:24px;margin:0 0 10px">You\'re offline</h1>' +
    '<p style="color:#8A8A80;max-width:300px;line-height:1.6;margin:0 0 24px">This page hasn\'t been opened on this device yet, so there\'s no saved copy. Pages you\'ve already visited still open.</p>' +
    (canGoToFeed ? '<a href="/feed" style="background:#1A7A4A;color:#fff;border-radius:24px;padding:12px 30px;font-size:15px;font-weight:600;text-decoration:none;margin-bottom:14px">Back to your feed</a>' : '') +
    '<button onclick="location.reload()" style="background:none;color:#8A8A80;border:0;padding:10px 20px;font-size:14px">Try again</button>' +
    '<script>addEventListener("online",function(){location.reload()})</script>'
}

// Offline, and nothing is saved for this exact page.
async function pageFallback(url) {
  const c = await caches.open(PAGES)
  const feed = await c.match('/feed', { ignoreSearch: true, ignoreVary: true })
  // Cold start: the app opens at "/", which online sends signed-in people to /feed. Do the
  // same from the saved copy instead of showing the feed's HTML under the address "/".
  if (feed && url.pathname === '/') return Response.redirect(new URL('/feed', self.location.origin).href, 302)
  // Any other page that was never opened here: say so, instead of showing a different
  // page's content under this page's address.
  return new Response(offlineHtml(!!feed), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

async function cacheFirst(event, name) {
  const c = await caches.open(name)
  const hit = await c.match(event.request)
  if (hit) return hit
  const res = await fetch(event.request)
  if (res.ok && res.type === 'basic') event.waitUntil(c.put(event.request, res.clone()))
  return res
}

// Cross-origin images (post photos, avatars). Saved once, shown from the device after that,
// refreshed in the background at most once a day. See the header notes for why CORS.
const noCorsHosts = new Set()   // hosts that answered a CORS request with an error (in memory only)

function isMediaImage(req, url) {
  if (req.destination !== 'image') return false
  if (url.hostname === 'cdn.spup.live' || url.hostname === 'res.cloudinary.com') return true
  return url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/')
}

async function fetchMedia(href) {
  const res = await fetch(href, { mode: 'cors', credentials: 'omit' })
  const type = res.headers.get('Content-Type') || ''
  if (res.status !== 200 || !type.startsWith('image/')) throw new Error('not a cacheable image')
  const blob = await res.blob()
  const make = () => new Response(blob, {
    status: 200,
    headers: { 'Content-Type': type, 'X-Spup-Cached-At': String(Date.now()) },
  })
  if (blob.size <= MAX_MEDIA_BYTES) await store(MEDIA, href, make(), MAX_MEDIA).catch(() => {})
  return make()
}

async function mediaImage(event, url) {
  const c = await caches.open(MEDIA)
  const hit = await c.match(url.href)
  if (hit) {
    const age = Date.now() - Number(hit.headers.get('X-Spup-Cached-At') || 0)
    if (age > MEDIA_REVALIDATE_MS) event.waitUntil(fetchMedia(url.href).catch(() => {}))
    return hit
  }
  let corsFailure = false
  if (!noCorsHosts.has(url.hostname)) {
    try { return await fetchMedia(url.href) } catch (err) { corsFailure = err instanceof TypeError }
  }
  try {
    const res = await fetch(event.request)
    // The CORS request failed but the plain one worked: this host sends no CORS headers.
    if (corsFailure && res.type === 'opaque') noCorsHosts.add(url.hostname)
    return res
  } catch {
    return Response.error()
  }
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

// The latest /feed open: resolves to 'updated' once the real page has been fetched and saved
// (the open page should then re-render so new posts can wait behind the pill), else 'none'.
let feedRevalidation = null

async function instantFeedCopy(url) {
  const c = await caches.open(PAGES)
  const hit = await c.match(url.origin + url.pathname, { ignoreVary: true })
  if (!hit) return null
  const at = Number(hit.headers.get('X-Spup-Cached-At') || 0)
  return at && Date.now() - at < INSTANT_FEED_MAX_AGE_MS ? hit : null
}

function revalidateFeed(req) {
  return fetch(req)
    .then(async (res) => {
      if (isGenuine(res, 'html')) { await store(PAGES, req.url, res.clone(), MAX_PAGES, true); return 'updated' }
      // The server redirected (e.g. the session ended): let the page ask again and follow it.
      if (res.type === 'opaqueredirect') return 'updated'
      return 'none'
    })
    .catch(() => 'none')
}

// Save the full HTML of a page that was reached by an in-app tap, so it also opens after a
// reload / cold start with no connection. Done once per page (and again at most every
// WARM_REFRESH_MS) and skipped on Data Saver. This is one extra render of that page on the
// server, which is the price of "every page you visited works offline".
const warming = new Set()

async function warmPage(url) {
  if (matchesPrefix(url.pathname, NO_WARM_PREFIXES)) return
  if (self.navigator && self.navigator.connection && self.navigator.connection.saveData) return
  const key = url.origin + url.pathname + url.search
  if (warming.has(key)) return
  warming.add(key)
  try {
    const c = await caches.open(PAGES)
    const hit = await c.match(key, { ignoreVary: true })
    if (hit) {
      const at = Number(hit.headers.get('X-Spup-Cached-At') || 0)
      if (!at || Date.now() - at < WARM_REFRESH_MS) return
    }
    const res = await fetch(key, { credentials: 'same-origin', redirect: 'manual', headers: { Accept: 'text/html,application/xhtml+xml' } })
    if (isGenuine(res, 'html')) await store(PAGES, key, res, MAX_PAGES, true)
  } catch { /* offline or slow: it will be saved the next time */ }
  finally { warming.delete(key) }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) {
    if (isMediaImage(req, url)) event.respondWith(mediaImage(event, url))
    return
  }
  const path = url.pathname

  // Explicit sign-out (signOutAction sends people to /login?signed_out=1): the next person
  // on this device must never see the previous account's pages.
  if (isAuthPath(path) && url.searchParams.has('signed_out') && (req.mode === 'navigate' || req.headers.get('RSC') === '1')) {
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
  if (req.headers.get('RSC') === '1' && isCacheablePage(path)) {
    if (req.headers.has('Next-Router-Prefetch') || req.headers.has('Next-Router-Segment-Prefetch')) return
    event.respondWith((async () => {
      const r = await networkFirst(event, RSC, rscKey(url), MAX_RSC, 'rsc')
      if (r.fresh) {
        // Reached by a tap: make sure the full page is saved too (reload / cold start).
        if (r.fresh.ok && !r.fresh.redirected) event.waitUntil(warmPage(url))
        return r.fresh
      }
      if (r.stale) { tellClientsStale(); return markStale(r.stale) }
      // Nothing saved: fail the fetch. Next then falls back to a normal page load,
      // which the navigation handler below answers from the saved HTML.
      return Response.error()
    })())
    return
  }

  // The app's front door on the main site. Online it redirects signed-in people to /feed (or
  // shows the landing page to everyone else); neither is worth saving. Offline, pageFallback
  // sends the person to their saved /feed.
  if (req.mode === 'navigate' && path === '/' && !IS_ADMIN_HOST) {
    event.respondWith(fetch(req).catch(() => pageFallback(url)))
    return
  }

  // Full page load (cold start, reload, link from outside).
  if (req.mode === 'navigate' && isCacheablePage(path)) {
    const isFeedOpen = path === '/feed' && !url.search
    // A reload means "give me the newest" - never answered from the saved copy.
    const isReload = req.cache === 'reload' || req.cache === 'no-cache'
    event.respondWith((async () => {
      if (isFeedOpen) {
        feedRevalidation = null
        if (!isReload) {
          const copy = await instantFeedCopy(url)
          if (copy) {
            feedRevalidation = revalidateFeed(req)
            event.waitUntil(feedRevalidation)
            return copy
          }
        }
      }
      const r = await networkFirst(event, PAGES, req.url, MAX_PAGES, 'html')
      if (r.fresh) return r.fresh
      if (r.stale) return markStale(r.stale)
      return pageFallback(url)
    })())
  }
})
