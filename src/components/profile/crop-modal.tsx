// src/components/profile/crop-modal.tsx
'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { X, ZoomIn, ZoomOut, Check } from 'lucide-react'

interface CropModalProps {
  file: File
  aspect: '1:1' | '3:1'
  onCancel: () => void
  onDone: (blob: Blob) => void
}

const OUTPUT = {
  '1:1': { w: 400,  h: 400  },
  '3:1': { w: 1500, h: 500  },
}

const MAX_CANVAS_W = 480

export default function CropModal({ file, aspect, onCancel, onDone }: CropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef    = useRef<HTMLImageElement | null>(null)
  const dragging  = useRef(false)
  const lastPos   = useRef({ x: 0, y: 0 })

  const [canvasW,   setCanvasW]   = useState(MAX_CANVAS_W)
  const [canvasH,   setCanvasH]   = useState(aspect === '1:1' ? MAX_CANVAS_W : Math.round(MAX_CANVAS_W / 3))
  const [offsetX,   setOffsetX]   = useState(0)
  const [offsetY,   setOffsetY]   = useState(0)
  const [zoom,      setZoom]      = useState(1)
  const [minZoom,   setMinZoom]   = useState(1)
  const [maxZoom,   setMaxZoom]   = useState(4)
  const [ready,     setReady]     = useState(false)
  const [exporting, setExporting] = useState(false)

  // ── Load image ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img  = new Image()

    img.onload = () => {
      imgRef.current = img

      const availW = Math.min(MAX_CANVAS_W, window.innerWidth - 80)
      const cW = availW
      const cH = aspect === '1:1' ? availW : Math.round(availW / 3)
      setCanvasW(cW)
      setCanvasH(cH)

      // cover zoom = image fills the canvas (no empty space) — this is the MINIMUM
      const coverZoom = Math.max(cW / img.naturalWidth, cH / img.naturalHeight)

      // contain zoom = whole image fits inside the canvas — this is the INITIAL zoom
      const containZoom = Math.min(cW / img.naturalWidth, cH / img.naturalHeight)

      // Start at contain so user sees the whole image first, then they zoom in
      // But never start below cover (e.g. tiny images)
      const initZoom = Math.max(containZoom, coverZoom)

      setMinZoom(coverZoom)
      setMaxZoom(coverZoom * 5)
      setZoom(initZoom)

      // Centre the image in the canvas at initial zoom
      const scaledW = img.naturalWidth  * initZoom
      const scaledH = img.naturalHeight * initZoom
      setOffsetX(Math.max(0, (scaledW - cW)  / 2 / initZoom))
      setOffsetY(Math.max(0, (scaledH - cH) / 2 / initZoom))

      setReady(true)
      URL.revokeObjectURL(url)
    }

    img.src = url
  }, [file, aspect])

  // ── Draw ────────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img    = imgRef.current
    if (!canvas || !img || !ready) return
    canvas.width  = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvasW, canvasH)
    ctx.drawImage(
      img,
      -offsetX * zoom, -offsetY * zoom,
      img.naturalWidth * zoom,
      img.naturalHeight * zoom,
    )
  }, [canvasW, canvasH, zoom, offsetX, offsetY, ready])

  useEffect(() => { draw() }, [draw])

  // ── Clamp offset so image always covers visible area ─────────────────────
  function clampOx(ox: number, z: number) {
    const img = imgRef.current!
    const maxOx = Math.max(0, (img.naturalWidth  * z - canvasW)  / z)
    return Math.max(0, Math.min(ox, maxOx))
  }
  function clampOy(oy: number, z: number) {
    const img = imgRef.current!
    const maxOy = Math.max(0, (img.naturalHeight * z - canvasH) / z)
    return Math.max(0, Math.min(oy, maxOy))
  }

  // ── Drag ─────────────────────────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true
    lastPos.current  = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || !imgRef.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setOffsetX(prev => clampOx(prev - dx / zoom, zoom))
    setOffsetY(prev => clampOy(prev - dy / zoom, zoom))
  }

  function onPointerUp() { dragging.current = false }

  // ── Zoom ──────────────────────────────────────────────────────────────────
  function applyZoom(z: number) {
    const clamped = Math.max(minZoom, Math.min(z, maxZoom))
    setZoom(clamped)
    setOffsetX(prev => clampOx(prev, clamped))
    setOffsetY(prev => clampOy(prev, clamped))
  }

  // Slider: 0 = minZoom (cover), 100 = maxZoom
  const sliderPct    = minZoom === maxZoom ? 0 : Math.round(((zoom - minZoom) / (maxZoom - minZoom)) * 100)
  const zoomDisplay  = Math.round((zoom / minZoom) * 100)

  function onSliderChange(pct: number) {
    applyZoom(minZoom + (pct / 100) * (maxZoom - minZoom))
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleDone() {
    const img = imgRef.current
    if (!img) return
    setExporting(true)

    const out = OUTPUT[aspect]
    const oc  = document.createElement('canvas')
    oc.width  = out.w
    oc.height = out.h
    const ctx = oc.getContext('2d')!
    ctx.drawImage(img, offsetX, offsetY, canvasW / zoom, canvasH / zoom, 0, 0, out.w, out.h)

    oc.toBlob(blob => {
      setExporting(false)
      if (blob) onDone(blob)
    }, 'image/jpeg', 0.92)
  }

  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
      />

      <div style={{
        position: 'fixed', zIndex: 201,
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: canvasW + 2,
        maxWidth: 'calc(100vw - 32px)',
        background: 'var(--bg-2, #0D0D12)',
        border: '1px solid var(--border, #1E1E26)',
        borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.9)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border, #1E1E26)',
        }}>
          <button onClick={onCancel} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary, #8A8A85)',
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 13, fontFamily: "'DM Sans', sans-serif", padding: 0,
          }}>
            <X size={16} /> Cancel
          </button>

          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--text-primary, #F0F0EC)' }}>
            {aspect === '1:1' ? 'Crop photo' : 'Crop cover'}
          </span>

          <button onClick={handleDone} disabled={!ready || exporting} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--spup-green, #1A9E5F)', border: 'none',
            borderRadius: 8, padding: '7px 14px',
            color: 'white', fontSize: 13, fontWeight: 700,
            fontFamily: "'Syne', sans-serif", cursor: 'pointer',
            opacity: (!ready || exporting) ? 0.5 : 1, transition: 'opacity 0.15s',
          }}>
            <Check size={14} />
            {exporting ? 'Saving…' : 'Apply'}
          </button>
        </div>

        {/* Canvas */}
        <div style={{ position: 'relative', lineHeight: 0, background: '#000' }}>
          <canvas
            ref={canvasRef}
            width={canvasW} height={canvasH}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            style={{ display: 'block', width: canvasW, height: canvasH, cursor: 'grab', touchAction: 'none' }}
          />

          {/* SVG overlays */}
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={canvasW} height={canvasH}>
            {aspect === '1:1' && (
              <>
                <defs>
                  <mask id="cm">
                    <rect width={canvasW} height={canvasH} fill="white" />
                    <circle cx={canvasW / 2} cy={canvasH / 2} r={Math.min(canvasW, canvasH) / 2 - 1} fill="black" />
                  </mask>
                </defs>
                <rect width={canvasW} height={canvasH} fill="rgba(0,0,0,0.5)" mask="url(#cm)" />
                <circle cx={canvasW / 2} cy={canvasH / 2} r={Math.min(canvasW, canvasH) / 2 - 1}
                  fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
              </>
            )}
            {[1, 2].map(i => (
              <line key={`v${i}`} x1={canvasW / 3 * i} y1={0} x2={canvasW / 3 * i} y2={canvasH}
                stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            ))}
            {[1, 2].map(i => (
              <line key={`h${i}`} x1={0} y1={canvasH / 3 * i} x2={canvasW} y2={canvasH / 3 * i}
                stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            ))}
            {aspect === '3:1' && (
              <rect x={1} y={1} width={canvasW - 2} height={canvasH - 2}
                fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
            )}
          </svg>

          {!ready && (
            <div style={{
              position: 'absolute', inset: 0, background: 'var(--bg-2, #0D0D12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 24, height: 24,
                border: '3px solid var(--spup-green, #1A9E5F)',
                borderTopColor: 'transparent', borderRadius: '50%',
                animation: 'crop-spin 0.7s linear infinite',
              }} />
            </div>
          )}
        </div>

        {/* Zoom bar */}
        <div style={{
          padding: '10px 16px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          borderTop: '1px solid var(--border, #1E1E26)',
          background: 'var(--bg-2, #0D0D12)',
        }}>
          <button onClick={() => applyZoom(zoom / 1.12)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary, #8A8A85)', display: 'flex', padding: 2,
          }}>
            <ZoomOut size={16} />
          </button>

          <input
            type="range" min={0} max={100} value={sliderPct}
            onChange={e => onSliderChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--spup-green, #1A9E5F)', cursor: 'pointer' }}
          />

          <button onClick={() => applyZoom(zoom * 1.12)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary, #8A8A85)', display: 'flex', padding: 2,
          }}>
            <ZoomIn size={16} />
          </button>

          <span style={{
            fontSize: 11, color: 'var(--text-muted, #44444A)',
            minWidth: 34, textAlign: 'right', fontFamily: "'DM Sans', sans-serif",
          }}>
            {zoomDisplay}%
          </span>
        </div>

        <style>{`@keyframes crop-spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </>
  )
}