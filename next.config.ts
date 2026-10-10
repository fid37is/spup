import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
    ],
  },
  // Client-side router cache. Next 15+ defaults dynamic pages to 0 seconds, so every
  // tap on a tab - and every Back - re-asked the server and showed a loading
  // screen first. With these, a page visited (or prefetched) in the last 30s
  // opens instantly from memory; static/prefetched ones are kept 5 minutes.
  // Anything that changes data calls revalidatePath(), which clears this cache,
  // so a mark-as-read / follow / profile edit is never shown stale.
  experimental: {
    staleTimes: { dynamic: 30, static: 300 },
  },
  // Capacitor static export — uncomment for mobile build
  // output: 'export',
  // trailingSlash: true,
}

export default nextConfig