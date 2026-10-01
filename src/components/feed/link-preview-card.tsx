'use client'

import React, { useEffect, useState } from 'react'
import { extractFirstUrl } from '@/lib/urls'

interface Preview { url: string; title: string | null; description: string | null; image_url: string | null; site_name: string | null }

// One request per link per page load, shared by every card that shows it.
const cache = new Map<string, Preview | null>()
const inflight = new Map<string, Promise<Preview | null>>()

function load(href: string): Promise<Preview | null> {
  if (cache.has(href)) return Promise.resolve(cache.get(href)!)
  let p = inflight.get(href)
  if (!p) {
    p = fetch(`/api/link-preview?url=${encodeURIComponent(href)}`)
      .then(r => (r.ok ? r.json() : { preview: null }))
      .then(j => (j.preview as Preview | null) ?? null)
      .catch(() => null)
      .then(v => { cache.set(href, v); inflight.delete(href); return v })
    inflight.set(href, p)
  }
  return p
}

/** Shows the Open Graph card for the first link in `body`. Renders nothing when there is no link or no card. */
export default function LinkPreviewCard({ body }: { body: string | null | undefined }) {
  const href = extractFirstUrl(body)
  const [preview, setPreview] = useState<Preview | null>(href && cache.has(href) ? cache.get(href)! : null)
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    if (!href) return
    let alive = true
    load(href).then(p => { if (alive) setPreview(p) })
    return () => { alive = false }
  }, [href])

  if (!href || !preview || (!preview.title && !preview.image_url)) return null
  const showImage = !!preview.image_url && !imgFailed

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      onClick={e => e.stopPropagation()}
      style={{
        display: 'block', textDecoration: 'none', overflow: 'hidden', marginBottom: 10,
        border: '1px solid var(--color-border)', borderRadius: 16, background: 'var(--color-surface)',
      }}
    >
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image_url!}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          style={{ display: 'block', width: '100%', aspectRatio: '1.91 / 1', objectFit: 'cover', background: 'var(--color-surface-2)' }}
        />
      )}
      <div style={{ padding: '10px 12px' }}>
        {preview.site_name && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {preview.site_name}
          </div>
        )}
        {preview.title && (
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {preview.title}
          </div>
        )}
        {preview.description && (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {preview.description}
          </div>
        )}
      </div>
    </a>
  )
}
