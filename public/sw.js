// Spup Service Worker v1.0
const CACHE_NAME = 'spup-v1'
const OFFLINE_URL = '/offline'

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  // removed /feed — auth-protected, breaks SW install
]

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, { cache: 'reload' })))
    })
  )
  self.skipWaiting()
})

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// ─── Fetch strategy ───────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET, API calls, and Supabase/Cloudinary requests
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/signup') ||
    url.pathname.startsWith('/forgot-password') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('paystack.co')
  ) {
    return  // Let browser handle natively
  }

  // HTML pages: network-first, fallback to offline page
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(OFFLINE_URL) || caches.match('/'))
    )
    return
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        if (response.ok && response.status < 300) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
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
  else if (action === 'view_post' || type === 'post_like' || type === 'post_comment') url = entityId ? `/post/${entityId}` : '/notifications'
  else url = '/notifications'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Open new window
      if (clients.openWindow) clients.openWindow(url)
    })
  )
})

// ─── Background sync (retry failed posts) ────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'retry-posts') {
    event.waitUntil(retryFailedPosts())
  }
})

async function retryFailedPosts() {
  // TODO: read from IndexedDB and retry
  console.log('Background sync: retrying failed posts')
}
