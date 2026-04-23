'use client'

import { useRef } from 'react'
import { X, Image, Video, Upload, Loader } from 'lucide-react'
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

export default function MediaGrid({
  media, uploading, progress, error, onUpload, onRemove, maxFiles = 4
}: MediaGridProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files)
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault() }

  const canAddMore = media.length < maxFiles && !uploading
  const gridCols = media.length === 1 ? 1 : 2

  return (
    <div>
      {/* Media previews */}
      {media.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gap: 4, borderRadius: 14, overflow: 'hidden',
          marginBottom: 12,
        }}>
          {media.map((m, i) => (
            <div key={m.id} style={{
              position: 'relative',
              aspectRatio: media.length === 1 ? '16/9' : '1/1',
              background: '#1A1A1A',
              gridColumn: media.length === 3 && i === 0 ? '1 / -1' : undefined,
              overflow: 'hidden',
            }}>
              {m.media_type === 'video' ? (
                <video
                  src={m.localPreview || m.url}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  muted
                />
              ) : (
                <img
                  src={m.localPreview || m.url}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}

              {/* Remove button */}
              <button
                onClick={() => onRemove(m.id)}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.7)', border: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: 'white',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <X size={14} />
              </button>

              {/* Upload progress overlay */}
              {m.id.startsWith('uploading-') && (
                <div style={{
                  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Loader size={24} color="white" style={{ animation: 'spin 0.8s linear infinite' }} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {/* Video badge */}
              {m.media_type === 'video' && !m.id.startsWith('uploading-') && (
                <div style={{
                  position: 'absolute', bottom: 8, left: 8,
                  background: 'rgba(0,0,0,0.7)', borderRadius: 6,
                  padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Video size={11} color="white" />
                  <span style={{ fontSize: 11, color: 'white' }}>Video</span>
                </div>
              )}
            </div>
          ))}

          {/* Add more slot */}
          {canAddMore && media.length > 0 && (
            <div
              onClick={() => inputRef.current?.click()}
              style={{
                aspectRatio: '1/1', background: '#1A1A1A',
                border: '2px dashed #2A2A2A', borderRadius: 4,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', gap: 6,
                transition: 'border-color 0.15s',
              }}
            >
              <Upload size={20} color="#555" />
              <span style={{ fontSize: 12, color: '#555' }}>Add more</span>
            </div>
          )}
        </div>
      )}

      {/* Upload progress bar */}
      {uploading && progress > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ height: 3, background: '#1A1A1A', borderRadius: 2 }}>
            <div style={{
              height: '100%', borderRadius: 2, background: '#22A861',
              width: `${progress}%`, transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{ fontSize: 11, color: '#555', marginTop: 4, display: 'block' }}>
            Uploading… {progress}%
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ fontSize: 13, color: '#E53935', marginBottom: 8 }}>{error}</p>
      )}

      {/* Drop zone — only when no media yet */}
      {media.length === 0 && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => inputRef.current?.click()}
          style={{
            border: '2px dashed #2A2A2A', borderRadius: 14,
            padding: '28px 20px', textAlign: 'center',
            cursor: 'pointer', marginBottom: 12,
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 10 }}>
            <Image size={22} color="#555" />
            <Video size={22} color="#555" />
          </div>
          <p style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>
            Drag photos or videos here
          </p>
          <p style={{ fontSize: 12, color: '#3A3A35' }}>
            JPG, PNG, GIF, WebP up to 10MB · MP4 up to 100MB
          </p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/mov,video/webm"
        multiple={maxFiles > 1}
        onChange={e => e.target.files && onUpload(e.target.files)}
        style={{ display: 'none' }}
      />
    </div>
  )
}
