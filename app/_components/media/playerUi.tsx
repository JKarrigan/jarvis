'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// Accent color: the media subtree sets --accent inline (MediaThemeRoot); elsewhere
// (e.g. the file browser) it's undefined, so these components fall back to zinc.
const ACCENT = 'var(--accent, #e4e4e7)'

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Pointer-draggable track used for both the seek bar and the volume slider. */
export function Slider({
  fraction,
  buffered = 0,
  onChange,
  onChangeStart,
  onChangeEnd,
  ariaLabel,
}: {
  fraction: number
  buffered?: number
  onChange: (f: number) => void
  onChangeStart?: () => void
  onChangeEnd?: () => void
  ariaLabel: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const fracFromEvent = (clientX: number) => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  const down = (e: React.PointerEvent) => {
    e.preventDefault()
    draggingRef.current = true
    onChangeStart?.()
    onChange(fracFromEvent(e.clientX))
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    if (draggingRef.current) onChange(fracFromEvent(e.clientX))
  }
  const up = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    onChangeEnd?.()
  }

  const pct = `${Math.min(100, Math.max(0, fraction * 100))}%`

  return (
    <div
      ref={trackRef}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      tabIndex={0}
      className="group/slider relative flex h-4 w-full cursor-pointer touch-none select-none items-center"
    >
      <div className="absolute inset-x-0 h-1.5 rounded-full bg-white/25" />
      {buffered > 0 && (
        <div
          className="absolute h-1.5 rounded-full bg-white/40"
          style={{ width: `${Math.min(100, buffered * 100)}%` }}
        />
      )}
      <div className="absolute h-1.5 rounded-full" style={{ width: pct, background: ACCENT }} />
      <div
        className="absolute h-3 w-3 -translate-x-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/slider:opacity-100"
        style={{ left: pct }}
      />
    </div>
  )
}

export function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={active ? { color: ACCENT } : undefined}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15 ${
        active ? '' : 'text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}

// --- control-bar glyphs (shared by both players) ----------------------------
export const IconPlay = () => (
  <svg viewBox="0 0 16 16" className="h-5 w-5 fill-current">
    <path d="M4 2.5a.5.5 0 01.768-.422l9 5.5a.5.5 0 010 .844l-9 5.5A.5.5 0 014 13.5v-11z" />
  </svg>
)
export const IconPause = () => (
  <svg viewBox="0 0 16 16" className="h-5 w-5 fill-current">
    <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />
  </svg>
)
export const IconSkipBack = () => (
  <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current">
    <path d="M9 4V1L4 5l5 4V6a4 4 0 11-4 4H3a6 6 0 106-6z" />
  </svg>
)
export const IconSkipForward = () => (
  <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current">
    <path d="M11 4V1l5 4-5 4V6a4 4 0 104 4h2a6 6 0 11-6-6z" />
  </svg>
)
export const IconMuted = () => (
  <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current">
    <path d="M9 4L5 7H2v6h3l4 3V4zM14.5 7.5l-2 2m0-2l2 2M17 6l-5 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M9 4L5 7H2v6h3l4 3V4z" />
  </svg>
)
export const IconVolume = () => (
  <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current">
    <path d="M9 4L5 7H2v6h3l4 3V4z" />
    <path d="M12.5 7a3.5 3.5 0 010 6M14.5 4.5a6.5 6.5 0 010 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
export const IconFullscreenEnter = () => (
  <svg viewBox="0 0 20 20" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round">
    <path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4" />
  </svg>
)
export const IconFullscreenExit = () => (
  <svg viewBox="0 0 20 20" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round">
    <path d="M8 3v5H3M12 3v5h5M8 17v-5H3M12 17v-5h5" />
  </svg>
)

// --- transient center-screen action flash (YouTube-style) -------------------
/** Transient center-screen feedback shown on a user action. */
export type FlashKind =
  | 'play'
  | 'pause'
  | 'rewind'
  | 'forward'
  | 'mute'
  | 'unmute'
  | 'volume'
  | 'fs-enter'
  | 'fs-exit'

/** The glyph shown inside the transient center-screen action badge. */
export function FlashIcon({ kind }: { kind: FlashKind }) {
  const fill = 'h-11 w-11 fill-current'
  const stroke = 'h-11 w-11 fill-none stroke-current'
  // Seek glyphs only fill part of their viewBox, so size them up a touch more.
  const seek = 'h-12 w-12 fill-current'
  switch (kind) {
    case 'play':
      return (
        <svg viewBox="0 0 16 16" className={fill}>
          <path d="M4 2.5a.5.5 0 01.768-.422l9 5.5a.5.5 0 010 .844l-9 5.5A.5.5 0 014 13.5v-11z" />
        </svg>
      )
    case 'pause':
      return (
        <svg viewBox="0 0 16 16" className={fill}>
          <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />
        </svg>
      )
    case 'rewind':
      // viewBox origin shifted to center the glyph (true center 9, 8.5), then nudged up ~3px.
      return (
        <svg viewBox="-1 -0.3 20 20" className={seek}>
          <path d="M9 4V1L4 5l5 4V6a4 4 0 11-4 4H3a6 6 0 106-6z" />
        </svg>
      )
    case 'forward':
      // viewBox origin shifted to center the glyph (true center 11, 8.5), then nudged up ~3px.
      return (
        <svg viewBox="1 -0.3 20 20" className={seek}>
          <path d="M11 4V1l5 4-5 4V6a4 4 0 104 4h2a6 6 0 11-6-6z" />
        </svg>
      )
    case 'mute':
      return (
        <svg viewBox="0 0 20 20" className={fill}>
          <path d="M9 4L5 7H2v6h3l4 3V4z" />
          <path d="M14.5 7.5l-2 2m0-2l2 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'unmute':
    case 'volume':
      return (
        <svg viewBox="0 0 20 20" className={fill}>
          <path d="M9 4L5 7H2v6h3l4 3V4z" />
          <path d="M12.5 7a3.5 3.5 0 010 6M14.5 4.5a6.5 6.5 0 010 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'fs-enter':
      return (
        <svg viewBox="0 0 20 20" className={stroke} strokeWidth="1.6" strokeLinecap="round">
          <path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4" />
        </svg>
      )
    case 'fs-exit':
      return (
        <svg viewBox="0 0 20 20" className={stroke} strokeWidth="1.6" strokeLinecap="round">
          <path d="M8 3v5H3M12 3v5h5M8 17v-5H3M12 17v-5h5" />
        </svg>
      )
  }
}

const FLASH_PHRASE: Record<FlashKind, (label?: string) => string> = {
  play: () => 'Playing',
  pause: () => 'Paused',
  rewind: l => `Rewind ${l ?? ''}`.trim(),
  forward: l => `Forward ${l ?? ''}`.trim(),
  mute: () => 'Muted',
  unmute: () => 'Unmuted',
  volume: l => `Volume ${l ?? ''}`.trim(),
  'fs-enter': () => 'Fullscreen',
  'fs-exit': () => 'Exited fullscreen',
}

export type FlashState = { id: number; kind: FlashKind; label?: string } | null

/**
 * Drives the center action flash: returns the current `flash`, an sr-only
 * `announce` string, and a stable `flashAction(kind, label?)` trigger. Each
 * call replays the badge for 600ms and clears the timer on unmount.
 */
export function useActionFlash() {
  const [flash, setFlash] = useState<FlashState>(null)
  const [announce, setAnnounce] = useState('')
  const idRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashAction = useCallback((kind: FlashKind, label?: string) => {
    idRef.current += 1
    setFlash({ id: idRef.current, kind, label })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setFlash(null), 600)
    const msg = FLASH_PHRASE[kind](label)
    // Re-announce identical consecutive actions by nudging the string (trailing space).
    setAnnounce(prev => (prev === msg ? `${msg} ` : msg))
  }, [])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  return { flash, announce, flashAction }
}

/**
 * Renders the center action badge + an sr-only live region. `suppressed` hides
 * the badge (e.g. while an error overlay is shown) without dropping the
 * announcement. Sits at z-10 (above video/spinner, below the chrome at z-20).
 */
export function CenterFlash({
  flash,
  announce,
  suppressed = false,
}: {
  flash: FlashState
  announce: string
  suppressed?: boolean
}) {
  return (
    <>
      <AnimatePresence>
        {flash && !suppressed && (
          <motion.div
            key={flash.id}
            aria-hidden
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.7, 1, 1, 1.18] }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.6, times: [0, 0.15, 0.5, 1], ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
              <FlashIcon kind={flash.kind} />
            </div>
            {flash.label && (
              <span className="text-sm font-semibold tabular-nums text-white drop-shadow">{flash.label}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
    </>
  )
}
