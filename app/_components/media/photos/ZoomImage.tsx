'use client'

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import NextImage from 'next/image'
import { browserCanShow, fileUrl, thumbUrl, type PhotoItem } from './api'

export type ZoomHandle = { toggleZoom: () => void; zoomed: boolean }

type Pt = { x: number; y: number }
type Xf = { s: number; x: number; y: number }

const MAX_SCALE = 6
const DOUBLE_TAP_MS = 280
const SWIPE_PX = 60

const IDENTITY: Xf = { s: 1, x: 0, y: 0 }

/**
 * A photo in the lightbox: shows the 1600px `p` preview, swaps to the original once the
 * user zooms in (the original can be tens of MB on a Pi-served NAS, so it isn't fetched
 * just to look), and handles pinch / wheel / double-tap zoom with clamped panning. At 1×
 * a horizontal drag is a swipe (prev/next), a downward drag closes, and a single tap
 * reports where it landed so the viewer can do edge-tap navigation / toggle its chrome.
 */
export function ZoomImage({
  item, onSwipe, onSwipeDown, onTap, onZoomChange, handleRef,
}: {
  item: PhotoItem
  onSwipe: (dir: 1 | -1) => void
  onSwipeDown: () => void
  /** Single tap at a horizontal fraction of the stage (0 = left edge). */
  onTap: (fx: number) => void
  onZoomChange?: (zoomed: boolean) => void
  handleRef?: React.Ref<ZoomHandle>
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ w: 0, h: 0 })
  const [xf, setXf] = useState<Xf>(IDENTITY)
  const [gesturing, setGesturing] = useState(false)
  const [drag, setDrag] = useState<Pt>({ x: 0, y: 0 })
  const [wantOriginal, setWantOriginal] = useState(() => item.mime === 'image/gif')
  const [originalReady, setOriginalReady] = useState(false)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)

  const xfRef = useRef(xf)
  useEffect(() => { xfRef.current = xf }, [xf])

  // Stage size (for fit + pan clamping).
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setStage({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const canOriginal = browserCanShow(item.mime)
  // Fetch the original in the background once zoom asks for it; swap only when decoded.
  useEffect(() => {
    if (!wantOriginal || !canOriginal) return
    const img = new Image()
    let live = true
    img.decoding = 'async'
    img.onload = () => { if (live) setOriginalReady(true) }
    img.src = fileUrl(item.id)
    return () => { live = false; img.onload = null }
  }, [wantOriginal, canOriginal, item.id])

  const aspect = item.width && item.height ? item.width / item.height : natural ? natural.w / natural.h : 1
  const fitW = stage.w && stage.h ? Math.min(stage.w, stage.h * aspect) : 0
  const fitH = aspect ? fitW / aspect : 0

  const clamp = useCallback((t: Xf): Xf => {
    const s = Math.min(MAX_SCALE, Math.max(1, t.s))
    const mx = Math.max(0, (fitW * s - stage.w) / 2)
    const my = Math.max(0, (fitH * s - stage.h) / 2)
    return { s, x: Math.min(mx, Math.max(-mx, t.x)), y: Math.min(my, Math.max(-my, t.y)) }
  }, [fitW, fitH, stage.w, stage.h])

  const apply = useCallback((t: Xf) => {
    const next = clamp(t)
    xfRef.current = next
    setXf(next)
    if (next.s > 1.05) setWantOriginal(true)
    onZoomChange?.(next.s > 1.01)
  }, [clamp, onZoomChange])

  /** Zoom to `s` keeping the stage point `p` (relative to the stage centre) fixed. */
  const zoomAt = useCallback((s: number, p: Pt, from: Xf = xfRef.current) => {
    const ns = Math.min(MAX_SCALE, Math.max(1, s))
    const cx = (p.x - from.x) / from.s
    const cy = (p.y - from.y) / from.s
    apply({ s: ns, x: p.x - cx * ns, y: p.y - cy * ns })
  }, [apply])

  const toggleZoom = useCallback((p: Pt = { x: 0, y: 0 }) => {
    if (xfRef.current.s > 1.01) apply(IDENTITY)
    else zoomAt(2.5, p, IDENTITY)
  }, [apply, zoomAt])

  useImperativeHandle(handleRef, () => ({ toggleZoom: () => toggleZoom(), zoomed: xf.s > 1.01 }), [toggleZoom, xf.s])

  const rel = useCallback((clientX: number, clientY: number): Pt => {
    const r = stageRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 }
  }, [])

  // Wheel / trackpad pinch zoom (non-passive so the page never scrolls behind).
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const k = e.ctrlKey ? 0.01 : 0.0022
      zoomAt(xfRef.current.s * Math.exp(-e.deltaY * k), rel(e.clientX, e.clientY))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, rel])

  // --- pointer gestures ---
  const pointers = useRef(new Map<number, Pt>())
  const pinch = useRef<{ dist: number; mid: Pt; from: Xf } | null>(null)
  const pan = useRef<{ start: Pt; from: Xf; t0: number; moved: boolean; multi: boolean } | null>(null)
  const lastTap = useRef<{ t: number; p: Pt } | null>(null)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current) }, [])

  const twoFinger = () => {
    const [a, b] = [...pointers.current.values()]
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, rel(e.clientX, e.clientY))
    setGesturing(true)
    if (pointers.current.size === 2) {
      const { dist, mid } = twoFinger()
      pinch.current = { dist, mid, from: xfRef.current }
      if (pan.current) pan.current.multi = true
      setDrag({ x: 0, y: 0 })
    } else if (pointers.current.size === 1) {
      pan.current = { start: rel(e.clientX, e.clientY), from: xfRef.current, t0: performance.now(), moved: false, multi: false }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const p = rel(e.clientX, e.clientY)
    pointers.current.set(e.pointerId, p)
    if (pointers.current.size >= 2 && pinch.current) {
      const { dist, mid } = twoFinger()
      const st = pinch.current
      const s = Math.min(MAX_SCALE, Math.max(1, st.from.s * (dist / Math.max(1, st.dist))))
      const cx = (st.mid.x - st.from.x) / st.from.s
      const cy = (st.mid.y - st.from.y) / st.from.s
      apply({ s, x: mid.x - cx * s, y: mid.y - cy * s })
      return
    }
    const pn = pan.current
    if (!pn || pn.multi) return
    const dx = p.x - pn.start.x
    const dy = p.y - pn.start.y
    if (!pn.moved && Math.hypot(dx, dy) > 6) pn.moved = true
    if (!pn.moved) return
    if (pn.from.s > 1.01) apply({ s: pn.from.s, x: pn.from.x + dx, y: pn.from.y + dy })
    else setDrag({ x: dx, y: Math.max(0, dy) * (Math.abs(dy) > Math.abs(dx) ? 1 : 0) })
  }

  const endPointer = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 1) {
      // Pinch → one finger left: continue as a pan from here.
      const [rest] = [...pointers.current.values()]
      pinch.current = null
      pan.current = { start: rest, from: xfRef.current, t0: performance.now(), moved: true, multi: false }
      return
    }
    if (pointers.current.size > 0) return
    setGesturing(false)
    pinch.current = null
    const pn = pan.current
    pan.current = null
    if (!pn || pn.multi) { setDrag({ x: 0, y: 0 }); return }

    const p = rel(e.clientX, e.clientY)
    const dx = p.x - pn.start.x
    const dy = p.y - pn.start.y
    setDrag({ x: 0, y: 0 })

    if (pn.moved) {
      if (pn.from.s <= 1.01 && e.type === 'pointerup') {
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.2) onSwipe(dx < 0 ? 1 : -1)
        else if (dy > 110 && dy > Math.abs(dx) * 1.2) onSwipeDown()
      }
      return
    }
    if (e.type !== 'pointerup' || performance.now() - pn.t0 > 350) return

    // Tap: double → zoom toggle at the point; single (after the double window) → onTap.
    const now = performance.now()
    const prev = lastTap.current
    if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(p.x - prev.p.x, p.y - prev.p.y) < 30) {
      lastTap.current = null
      if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null }
      toggleZoom(p)
      return
    }
    lastTap.current = { t: now, p }
    const fx = stage.w ? (p.x + stage.w / 2) / stage.w : 0.5
    if (tapTimer.current) clearTimeout(tapTimer.current)
    tapTimer.current = setTimeout(() => { tapTimer.current = null; onTap(fx) }, DOUBLE_TAP_MS)
  }

  const showOriginal = canOriginal && originalReady
  const style: React.CSSProperties = {
    width: fitW || '100%',
    height: fitH || '100%',
    transform: `translate3d(${xf.x + drag.x}px, ${xf.y + drag.y}px, 0) scale(${xf.s})`,
    opacity: drag.y > 0 ? Math.max(0.35, 1 - drag.y / 400) : 1,
  }

  return (
    <div
      ref={stageRef}
      className={`absolute inset-0 flex touch-none select-none items-center justify-center overflow-hidden ${xf.s > 1.01 ? 'cursor-grab active:cursor-grabbing' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      <div
        className={`relative shrink-0 will-change-transform ${gesturing ? '' : 'transition-transform duration-200 ease-out'}`}
        style={style}
      >
        <NextImage
          src={thumbUrl(item, 'p')}
          alt=""
          fill
          unoptimized
          loading="eager"
          draggable={false}
          onLoad={e => {
            const img = e.currentTarget
            if (!(item.width && item.height)) setNatural({ w: img.naturalWidth, h: img.naturalHeight })
          }}
          className="object-contain"
        />
        {showOriginal && (
          <NextImage src={fileUrl(item.id)} alt="" fill unoptimized draggable={false} className="object-contain" />
        )}
      </div>
    </div>
  )
}
