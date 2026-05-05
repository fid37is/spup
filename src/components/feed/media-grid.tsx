'use client'

import { useRef } from 'react'
import { X, Image, Video, Loader } from 'lucide-react'
import type { UploadedMedia } from '@/hooks/use-media-upload'

interface MediaGridProps {
  media: UploadedMedia[]
  uploading: boolean
  progress: number
  error: string
  onUpload: (files: FileList | File[]) => void
  onRemove: (id: string) => void
  maxFiles?: number
}

// Grid layout mirrors Twitter:
//   1 file  → full width, 16:9
//   2 files → 2 cols, square each
//   3 files → left half tall, right half split top/bottom
//   4 files → 2×2 grid, square each

export default function MediaGrid({
  media, uploading, progress, error, onRemove,
}: MediaGridProps) {
  const count = media.length
  if (count === 0 && !uploading && !error) return null

  return (
    <div>
      {/* Grid */}
      {count > 0 && (
        <div style={{
          display: 'grid',
          gap: 3,
          borderRadius: 14,
          overflow: 'hidden',
          // Layout varies by count
          gridTemplateColumns: count === 1 ? '1fr' : '1fr 1fr',
          gridTemplateRows:
            count === 1 ? 'auto'
            : count === 2 ? '200px'
            : count === 3 ? '150px 150px'
            : '150px 150px',
        }}>
          {media.map((m, i) => {
            // 3-item layout: first item spans both rows on the left
            const gridStyles: React.CSSProperties =
              count === 3 && i === 0
                ? { gridRow: '1 / 3' }
                : {}

            return (
              <div
                key={m.id}
                style={{
                  position: 'relative',
                  background: 'var(--color-surface-3)',
                  overflow: 'hidden',
                  // 1-file gets 16:9, others fill their grid cell
                  aspectRatio: count === 1 ? '16/9' : undefined,
                  minHeight: count === 1 ? undefined : 'inherit',
                  ...gridStyles,
                }}
              >
                {m.media_type === 'video' ? (
                  <video
                    src={m.localPreview || m.url}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    muted
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.localPreview || m.url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                )}

                {/* Remove button */}
                <button
                  onClick={() => onRemove(m.id)}
                  title="Remove"
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.75)', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: 'white',
                    backdropFilter: 'blur(6px)',
                    transition: 'background 0.12s',
                    zIndex: 2,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.92)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.75)'}
                >
                  <X size={13} />
                </button>

                {/* Uploading overlay */}
                {m.id?.startsWith('uploading-') && (
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                  }}>
                    <Loader size={22} color="white" style={{ animation: 'spin 0.8s linear infinite' }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </div>
                )}

                {/* Video badge */}
                {m.media_type === 'video' && !m.id?.startsWith('uploading-') && (
                  <div style={{
                    position: 'absolute', bottom: 7, left: 8,
                    background: 'rgba(0,0,0,0.7)', borderRadius: 5,
                    padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 4, zIndex: 1,
                  }}>
                    <Video size={10} color="white" />
                    <span style={{ fontSize: 10, color: 'white', fontWeight: 600 }}>Video</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Upload progress bar */}
      {uploading && progress > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 3, background: 'var(--color-border)', borderRadius: 2 }}>
            <div style={{
              height: '100%', borderRadius: 2, background: 'var(--color-brand)',
              width: `${progress}%`, transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, display: 'block' }}>
            Uploading… {progress}%
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ fontSize: 13, color: 'var(--color-error)', marginTop: 6 }}>{error}</p>
      )}
    </div>
  )
}