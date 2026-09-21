// Spup Service Worker v4.0
// v2: network-first for _next/static chunks to prevent stale CSS flash
// v3: only show the dedicated /offline page when the device is actually
//     disconnected (navigator.onLine === false). A slow/flaky connection
//     still reports onLine === true - for that case, serve whatever's
//     cached instead of telling the person they're offline when they're
//     not, so they can keep reading while a spotty connection just quietly
//     fails to fetch anything new.
// v4: built for slow connections.
//     - /_next/static/* is cache-first. Those files are content-hashed (a new
//       deploy gets new URLs), so a cached copy can never be "stale" - and
//       network-first meant every app open waited on the network for
//       JavaScript and CSS the phone already had.
//     - Page loads are still network-first, but only wait NAV_TIMEOUT_MS. On a
//       slow connection the last cached copy of the page is shown instead of
//       leaving the person on the launch screen; the network response keeps
//       loading in the background and refreshes the cache for next time.
const PAGES_CACHE = 'spup-pages-v4'
const STATIC_CACHE = 'spup-static-v4'
const OFFLINE_URL = '/offline'

// How long a page load may wait on the network before falling back to the
// cached copy (only applies when there is a cached copy).
const NAV_TIMEOUT_MS = 3000
// Old build chunks pile up in the static cache across deploys - cap it.
const STATIC_CACHE_MAX_ENTRIES = 120

const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
]

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  // cache.keys() is in insertion order, so the oldest entries come first.
  for (let i = 0; i < keys.length - maxEntries; i++) await cache.delete(keys[i])
}

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(PAGES_CACHE).then(cache => {
      return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, { cache: 'reload' })))
    })
  )
  self.skipWaiting()
})

// ─── Activate - wipe all old caches ──────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== PAGES_CACHE && key !== STATIC_CACHE).map(key => {
          console.log('Spup SW: deleting old cache', key)
          return caches.delete(key)
        })
      )
    )
  )
  self.clients.claim()
})

// ─── Page loads: network first, but never wait forever ───────────────────────
async function handleNavigation(event) {
  const request = event.request
  const cache = await caches.open(PAGES_CACHE)

  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone())
    return response
  })
  // Keep the worker alive so the cache refresh finishes even when we
  // answered from cache before the network came back.
  event.waitUntil(networkPromise.catch(() => {}))

  const offlineFallback = async () => {
    if (!self.navigator.onLine) {
      // Genuinely disconnected (wifi/data off, airplane mode) - this is
      // the case the offline page exists for.
      return (await caches.match(OFFLINE_URL)) || (await caches.match('/'))
    }
    // A live network interface is present, so this is a slow/flaky
    // connection or a one-off failed request rather than "no internet" -
    // don't claim they're offline. Serve whatever's cached for this page
    // (or the app shell) so they can keep reading.
    return (await caches.match(request)) || (await caches.match('/')) || Response.error()
  }

  const cached = await cache.match(request)
  if (!cached) {
    // Nothing to fall back on yet (first visit to this page) - wait it out.
    return networkPromise.catch(offlineFallback)
  }

  const timeout = new Promise(resolve => setTimeout(() => resolve(null), NAV_TIMEOUT_MS))
  const winner = await Promise.race([networkPromise.catch(() => null), timeout])
  if (winner) return winner
  // Slow or failed network: show the cached copy (or the offline page when
  // the device really is disconnected).
  return self.navigator.onLine ? cached : offlineFallback()
}

// ─── Fetch strategy ───────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET, API routes, and third-party hosts
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/signup') ||
    url.pathname.startsWith('/forgot-password') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('paystack.co') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    return
  }

  // ── HTML: network-first with a timeout ────────────────────────────────────
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(handleNavigation(event))
    return
  }

  // ── Next.js JS/CSS chunks: cache-first ───────────────────────────────────
  // Content-hashed by Next.js: every deploy produces new file names, so a
  // cached file is always exactly the file its URL promises. (The old
  // "stale CSS flash" came from old HTML, not from cached chunks - and old
  // HTML plus its own old chunks is a consistent pair.)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async cache => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) {
          cache.put(request, response.clone()).then(() => trimCache(STATIC_CACHE, STATIC_CACHE_MAX_ENTRIES))
        }
        return response
      })
    )
    return
  }

  // ── Other static assets (images, icons, manifest): cache-first ───────────
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        if (response.ok && response.status < 300) {
          const clone = response.clone()
          caches.open(PAGES_CACHE).then(cache => cache.put(request, clone))
        }
        return response
      }).catch(() => cached)
    })
  )
})

// ─── Push Notifications ───────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return

  const data = event.data.json()
  const { title, body, type, entityId, actorUsername } = data

  const options = {
    body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: { type, entityId, actorUsername },
    actions: getActions(type),
    tag: `spup-${type}-${entityId || Date.now()}`,
    renotify: true,
  }

  event.waitUntil(
    self.registration.showNotification(title || 'Spup', options)
  )
})

function getActions(type) {
  switch (type) {
    case 'new_follower':
      return [{ action: 'view_profile', title: 'View profile' }]
    case 'post_like':
    case 'post_comment':
    case 'post_repost':
    case 'post_quote':
    case 'mention':
    case 'new_post':
      return [{ action: 'view_post', title: 'View post' }, { action: 'dismiss', title: 'Dismiss' }]
    case 'tip_received':
      return [{ action: 'view_wallet', title: 'View wallet' }]
    default:
      return []
  }
}

// ─── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()

  const { type, entityId, actorUsername } = event.notification.data || {}
  const action = event.action

  let url = '/'
  if (action === 'view_wallet' || type === 'tip_received') url = '/wallet'
  else if (action === 'view_profile' || type === 'new_follower') url = actorUsername ? `/user/${actorUsername}` : '/notifications'
  else if (action === 'view_post' || ['post_like', 'post_comment', 'post_repost', 'post_quote', 'mention', 'new_post'].includes(type)) url = entityId ? `/post/${entityId}` : '/notifications'
  else url = '/notifications'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      if (clients.openWindow) clients.openWindow(url)
    })
  )
})

// ─── Background sync ─────────────────────────────────────────────────────────
// Only fires on browsers that support Background Sync (Chrome/Android) -
// iOS Safari has no equivalent, so use-offline-post-sync.ts's foreground
// fallback (on the 'online' event / app open) is what covers those users.
// This duplicates the plain-IndexedDB logic from src/lib/offline-post-queue.ts
// in vanilla JS because this is a classic (non-module) service worker and
// can't import TS/ESM - keep both in sync if the schema here changes.
self.addEventListener('sync', event => {
  if (event.tag === 'retry-posts') {
    event.waitUntil(retryFailedPosts())
  }
})

const OFFLINE_DB_NAME = 'spup-offline'
const OFFLINE_DB_VERSION = 1
const OFFLINE_STORE = 'pending_posts'

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
        db.createObjectStore(OFFLINE_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function getAllPending(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE, 'readonly')
    const req = tx.objectStore(OFFLINE_STORE).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

function deletePending(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE, 'readwrite')
    tx.objectStore(OFFLINE_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function retryFailedPosts() {
  const db = await openOfflineDB()
  const pending = await getAllPending(db)

  for (const post of pending) {
    try {
      const form = new FormData()
      if (post.body) form.append('body', post.body)
      form.append('isSelling', String(post.isSelling))
      for (const m of post.media || []) form.append('media', m.blob, m.name)

      const res = await fetch('/api/posts/sync', { method: 'POST', body: form })
      if (res.ok) {
        await deletePending(db, post.id)
      }
      // Leave failed ones in the queue - they'll be retried on the next
      // sync event, or picked up by the foreground fallback when the app
      // is next opened.
    } catch {
      // Network still bad mid-sync - stop here, the next sync/online
      // event will pick up where this left off.
      break
    }
  }
  db.close()
}