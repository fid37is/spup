import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  // Capacitor static export — uncomment for mobile build
  // output: 'export',
  // trailingSlash: true,
}

export default nextConfig
