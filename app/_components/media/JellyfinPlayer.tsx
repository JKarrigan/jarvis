'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AudioTrack, SubtitleTrack, MediaVersion } from './types'

interface PlaybackSource {
  itemId: string
  method: 'direct' | 'hls'
  url: string
  mediaSourceId: string
  playSessionId: string
  positionTicks: number
  runtimeTicks: number
  transcoding: boolean
  playMethodLabel: string
  audioStreamIndex?: number
  subtitleStreamIndex?: number
}

type ReportKind = 'start' | 'progress' | 'stopped'

/** Transient center-screen feedback shown on a user action (YouTube-style). */
type FlashKind =
  | 'play'
  | 'pause'
  | 'rewind'
  | 'forward'
  | 'mute'
  | 'unmute'
  | 'volume'
  | 'fs-enter'
  | 'fs-exit'

/**
 * Structural type for a hls.js instance — declared here so the source-loading
 * effect and the stall watchdog can share the live instance via a ref without
 * statically importing hls.js (it stays dynamically imported / out of the bundle).
 */
type HlsInstance = {
  destroy: () => void
  startLoad: (startPosition?: number) => void
  recoverMediaError: () => void
  swapAudioCodec: () => void
  loadSource: (url: string) => void
  attachMedia: (el: HTMLMediaElement) => void
  on: (event: string, cb: (event: string, data: { type: string; fatal: boolean }) => void) => void
}

// --- stall / recovery tuning -------------------------------------------------
const INIT_TIMEOUT_MS = 30_000 // first frame must arrive within this (cold transcode allowance)
const STALL_SOFT_MS = 6_000 // no currentTime progress this long → cheap nudge
const STALL_HARD_MS = 15_000 // …this long → full source reload
const RELOAD_COOLDOWN_MS = 10_000 // min gap between reload escalations
const HEALTHY_RESET_MS = 30_000 // healthy playback this long → reset recovery counters
const MAX_RELOADS = 2 // hard cap on watchdog/fatal-driven reloads before giving up

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Pointer-draggable track used for both the seek bar and the volume slider. */
function Slider({
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
      <div className="absolute h-1.5 rounded-full" style={{ width: pct, background: 'var(--accent)' }} />
      <div
        className="absolute h-3 w-3 -translate-x-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/slider:opacity-100"
        style={{ left: pct }}
      />
    </div>
  )
}

function IconButton({
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
      style={active ? { color: 'var(--accent)' } : undefined}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15 ${
        active ? '' : 'text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}

/** The glyph shown inside the transient center-screen action badge. */
function FlashIcon({ kind }: { kind: FlashKind }) {
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

function MenuRow({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={selected ? { color: 'var(--accent)' } : undefined}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition ${
        selected ? '' : 'text-zinc-200 hover:bg-white/10'
      }`}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center">
        {selected && (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
            <path d="M13.5 3.5L6 11 2.5 7.5 1 9l5 5 9-9z" />
          </svg>
        )}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}

/** In-player popover for switching version / audio / subtitle tracks. */
function TrackMenu({
  versions,
  audio,
  subtitles,
  versionId,
  audioIndex,
  subtitleIndex,
  onVersion,
  onAudio,
  onSubtitle,
}: {
  versions: MediaVersion[]
  audio: AudioTrack[]
  subtitles: SubtitleTrack[]
  versionId?: string
  audioIndex?: number
  subtitleIndex: number | null
  onVersion: (id: string) => void
  onAudio: (i: number) => void
  onSubtitle: (i: number | null) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97, transition: { duration: 0.12, ease: 'easeIn' } }}
      transition={{ type: 'spring', bounce: 0.2, duration: 0.26 }}
      className="absolute bottom-full right-0 mb-2 max-h-[60vh] w-[230px] overflow-y-auto rounded-xl border border-white/10 p-1.5 shadow-2xl backdrop-blur-xl"
      style={{ background: 'rgba(18,18,20,0.97)' }}
    >
      {versions.length > 1 && (
        <>
          <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Version</p>
          {versions.map(v => (
            <MenuRow key={v.id} label={v.name} selected={v.id === versionId} onClick={() => onVersion(v.id)} />
          ))}
        </>
      )}
      {audio.length > 0 && (
        <>
          <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Audio</p>
          {audio.map(a => (
            <MenuRow key={a.index} label={a.label} selected={a.index === audioIndex} onClick={() => onAudio(a.index)} />
          ))}
        </>
      )}
      {subtitles.length > 0 && (
        <>
          <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Subtitles</p>
          <MenuRow label="Off" selected={subtitleIndex == null} onClick={() => onSubtitle(null)} />
          {subtitles.map(s => (
            <MenuRow
              key={s.index}
              label={s.label}
              selected={s.index === subtitleIndex}
              onClick={() => onSubtitle(s.index)}
            />
          ))}
        </>
      )}
    </motion.div>
  )
}

export default function JellyfinPlayer({
  itemId,
  title,
  onClose,
  splashUrl,
  versions = [],
  initialSourceId,
  initialAudioIndex,
  initialSubtitleIndex = null,
}: {
  itemId: string
  title?: string
  onClose: () => void
  /** Artwork (backdrop / episode still) shown as the loading splash before first frame. */
  splashUrl?: string
  versions?: MediaVersion[]
  initialSourceId?: string
  initialAudioIndex?: number
  initialSubtitleIndex?: number | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const [attempt, setAttempt] = useState(0) // bump to retry; >0 forces HLS
  const [ready, setReady] = useState(false)
  // Whether the very first frame has loaded — gates the movie splash (initial load only).
  const [everReady, setEverReady] = useState(false)
  const [buffering, setBuffering] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- track selection (version / audio / subtitle) -----------------------
  const [sourceId, setSourceId] = useState<string | undefined>(initialSourceId ?? versions[0]?.id)
  const [audioIndex, setAudioIndex] = useState<number | undefined>(initialAudioIndex)
  const [subIndex, setSubIndex] = useState<number | null>(initialSubtitleIndex)
  // Seconds to resume to after a manual (selection-driven) reload; 0 = use server position.
  const pendingSeekRef = useRef(0)

  // --- stall watchdog + recovery state (refs: no re-render churn) ----------
  const hlsRef = useRef<HlsInstance | null>(null)
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastProgressRef = useRef({ t: 0, at: 0 })
  const playStartedAtRef = useRef(0)
  const nudgedRef = useRef(false)
  const recoveryRef = useRef({ media: 0, network: 0, reload: 0, lastMediaErrorAt: 0, lastReloadAt: 0 })

  const currentVersion = useMemo(
    () => versions.find(v => v.id === sourceId) ?? versions[0] ?? null,
    [versions, sourceId],
  )
  const audioTracks = useMemo(() => currentVersion?.audio ?? [], [currentVersion])
  const subtitleTracks = useMemo(() => currentVersion?.subtitles ?? [], [currentVersion])
  const selectedSubTrack = subIndex == null ? null : subtitleTracks.find(s => s.index === subIndex) ?? null
  // Image subtitles (PGS/VOBSUB) must be burned in (a server reload); text subs overlay live.
  const burnSubIndex = selectedSubTrack && !selectedSubTrack.isText ? selectedSubTrack.index : null
  const subtitleSrc =
    selectedSubTrack && selectedSubTrack.isText && sourceId
      ? `/api/jellyfin/subtitle?id=${encodeURIComponent(itemId)}&source=${encodeURIComponent(sourceId)}&index=${selectedSubTrack.index}`
      : null
  const hasTrackChoices = audioTracks.length > 1 || subtitleTracks.length > 0 || versions.length > 1

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [playLabel, setPlayLabel] = useState<string | null>(null)
  const [transcoding, setTranscoding] = useState(false)

  const isPlayingRef = useRef(false)
  const menuOpenRef = useRef(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    menuOpenRef.current = menuOpen
  }, [menuOpen])

  // Close the track menu on an outside click (mirrors FilterDropdown).
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  // --- control visibility (auto-hide while playing) -----------------------
  const poke = useCallback(() => {
    setShowControls(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (isPlayingRef.current && !menuOpenRef.current) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [])

  // --- transient center-screen action flash (YouTube-style) ---------------
  const [flash, setFlash] = useState<{ id: number; kind: FlashKind; label?: string } | null>(null)
  const [announce, setAnnounce] = useState('') // sr-only live-region text (the badge is decorative)
  const flashIdRef = useRef(0)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashAction = useCallback((kind: FlashKind, label?: string) => {
    flashIdRef.current += 1
    setFlash({ id: flashIdRef.current, kind, label })
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlash(null), 600)
    const phrase: Record<FlashKind, string> = {
      play: 'Playing',
      pause: 'Paused',
      rewind: `Rewind ${label ?? ''}`.trim(),
      forward: `Forward ${label ?? ''}`.trim(),
      mute: 'Muted',
      unmute: 'Unmuted',
      volume: `Volume ${label ?? ''}`.trim(),
      'fs-enter': 'Fullscreen',
      'fs-exit': 'Exited fullscreen',
    }
    const msg = phrase[kind]
    // Re-announce identical consecutive actions by nudging the string (zero-width space).
    setAnnounce(prev => (prev === msg ? `${msg} ` : msg))
  }, [])
  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
  }, [])

  // --- imperative controls (stable; read the video ref directly) ----------
  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
      flashAction('play')
    } else {
      v.pause()
      flashAction('pause')
    }
  }, [flashAction])
  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current
      if (!v) return
      const before = v.currentTime
      const target = Math.max(0, Math.min(v.duration || 0, before + delta))
      v.currentTime = target
      // Don't flash a phantom jump when clamped to a no-op at the start/end.
      const moved = target - before
      if (Math.abs(moved) > 0.05) {
        flashAction(moved < 0 ? 'rewind' : 'forward', `${Math.round(Math.abs(moved))}s`)
      }
    },
    [flashAction],
  )
  const seekToFraction = useCallback((f: number) => {
    const v = videoRef.current
    if (!v || !v.duration) return
    v.currentTime = f * v.duration
    setCurrentTime(v.currentTime)
  }, [])
  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    flashAction(v.muted ? 'mute' : 'unmute')
  }, [flashAction])
  const changeVolume = useCallback((f: number) => {
    const v = videoRef.current
    if (!v) return
    v.muted = false
    v.volume = Math.min(1, Math.max(0, f))
  }, [])
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
      flashAction('fs-exit')
    } else {
      el.requestFullscreen?.().catch(() => {})
      flashAction('fs-enter')
    }
  }, [flashAction])

  // Remember where we are, so the next (selection-driven) source reload resumes here.
  // A deliberate user switch also refreshes the auto-recovery budget.
  const markResume = useCallback(() => {
    pendingSeekRef.current = videoRef.current?.currentTime ?? 0
    recoveryRef.current.reload = 0
    recoveryRef.current.lastReloadAt = 0
  }, [])

  // Manual retry from the error screen: fresh budget, resume in place, force HLS.
  const retry = useCallback(() => {
    recoveryRef.current = { media: 0, network: 0, reload: 0, lastMediaErrorAt: 0, lastReloadAt: 0 }
    pendingSeekRef.current = videoRef.current?.currentTime || pendingSeekRef.current
    setError(null)
    setAttempt(a => a + 1)
  }, [])

  const selectVersion = useCallback(
    (id: string) => {
      if (id === sourceId) return
      markResume()
      const v = versions.find(x => x.id === id)
      setSourceId(id)
      setAudioIndex(v ? v.defaultAudioIndex ?? v.audio[0]?.index : undefined)
      setSubIndex(v?.defaultSubtitleIndex ?? null)
    },
    [sourceId, versions, markResume],
  )
  const selectAudio = useCallback(
    (i: number) => {
      if (i === audioIndex) return
      markResume()
      setAudioIndex(i)
    },
    [audioIndex, markResume],
  )
  const selectSubtitle = useCallback(
    (i: number | null) => {
      if (i === subIndex) return
      const next = i == null ? null : subtitleTracks.find(s => s.index === i) ?? null
      const willBurn = next ? !next.isText : false
      const wasBurn = burnSubIndex != null
      // Only image-subtitle transitions need a stream reload; text subs swap the <track> live.
      if (willBurn || wasBurn) markResume()
      setSubIndex(i)
    },
    [subIndex, subtitleTracks, burnSubIndex, markResume],
  )

  // --- source loading + playback reporting --------------------------------
  // Re-runs on retry (attempt), version (sourceId), audio, or a burned-in subtitle change.
  // Text-subtitle changes do NOT re-run this (handled by the <track> below).
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    let hls: HlsInstance | null = null
    let source: PlaybackSource | null = null
    let progressTimer: ReturnType<typeof setInterval> | null = null
    const ac = new AbortController()
    const forceHls = attempt > 0

    setReady(false)
    setBuffering(true)
    setError(null)
    // Per-load HLS error counters reset each load (each load = a fresh hls.js
    // instance). The reload/cooldown budget intentionally PERSISTS across
    // attempt-driven reloads so MAX_RELOADS can actually cap them.
    recoveryRef.current.media = 0
    recoveryRef.current.network = 0
    recoveryRef.current.lastMediaErrorAt = 0
    nudgedRef.current = false

    function sendReport(kind: ReportKind, paused = false) {
      if (!source || !video) return
      fetch('/api/jellyfin/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          report: {
            ItemId: source.itemId,
            PlaySessionId: source.playSessionId,
            MediaSourceId: source.mediaSourceId,
            PositionTicks: Math.round(video.currentTime * 1e7),
            IsPaused: paused,
            AudioStreamIndex: source.audioStreamIndex,
            SubtitleStreamIndex: source.subtitleStreamIndex,
          },
        }),
        keepalive: kind === 'stopped',
      }).catch(() => {})
    }

    function resumeSeconds(): number {
      if (!source) return 0
      if (pendingSeekRef.current > 0) return pendingSeekRef.current
      return source.positionTicks > 0 ? source.positionTicks / 1e7 : 0
    }

    function onLoadedMetadata() {
      if (!video || !source) return
      const startAt = resumeSeconds()
      if (startAt > 0 && video.currentTime < 1) {
        try {
          video.currentTime = startAt
        } catch {
          /* not seekable yet */
        }
      }
      pendingSeekRef.current = 0
      setDuration(video.duration || source.runtimeTicks / 1e7 || 0)
      setReady(true)
      setEverReady(true)
    }
    function onPlaying() {
      sendReport('start')
    }
    function onPauseReport() {
      sendReport('progress', true)
    }
    function onEnded() {
      sendReport('stopped')
      onCloseRef.current()
    }
    function onError() {
      // MKV / DTS etc. can fail browser direct-play even when Jellyfin allows it —
      // retry once over HLS (server transcode).
      if (source?.method === 'direct' && attempt === 0) setAttempt(1)
      else if (!cancelled) setError('This title could not be played.')
    }

    // --- recovery ladder ---------------------------------------------------
    // Full source reload: resume at the current position via a fresh HLS load.
    // Bounded by a cooldown + MAX_RELOADS so an unplayable title can't loop.
    function escalateReload() {
      if (cancelled || !video) return
      const now = performance.now()
      if (now - recoveryRef.current.lastReloadAt < RELOAD_COOLDOWN_MS) return
      if (recoveryRef.current.reload >= MAX_RELOADS) {
        setError('Playback keeps stalling. Try again.')
        return
      }
      recoveryRef.current.reload++
      recoveryRef.current.lastReloadAt = now
      pendingSeekRef.current = video.currentTime || pendingSeekRef.current
      setAttempt(a => (a > 0 ? a + 1 : 1)) // >0 forces HLS on reload
    }

    function giveUp() {
      if (recoveryRef.current.reload < MAX_RELOADS) escalateReload()
      else if (!cancelled) setError('Playback keeps stalling. Try again.')
    }

    // hls.js fatal-error recovery — the direct fix for "audio plays, video frozen".
    function onHlsError(
      HlsCtor: { ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string } },
      data: { type: string; fatal: boolean },
    ) {
      if (!data.fatal || cancelled) return
      const h = hlsRef.current
      const now = performance.now()
      if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
        if (recoveryRef.current.network >= 2) return giveUp()
        recoveryRef.current.network++
        h?.startLoad()
        return
      }
      if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
        const recent = now - recoveryRef.current.lastMediaErrorAt < 3000
        recoveryRef.current.lastMediaErrorAt = now
        if (recoveryRef.current.media >= 2) return giveUp()
        recoveryRef.current.media++
        // A second media error in quick succession (audio fine, video stuck) →
        // swap the audio codec before recovering, hls.js's canonical remedy.
        if (recent && recoveryRef.current.media >= 2) h?.swapAudioCodec()
        h?.recoverMediaError()
        return
      }
      giveUp()
    }

    // Cheap, branch-aware nudge tried once per stall episode before a reload.
    function nudge() {
      if (!video) return
      nudgedRef.current = true
      const h = hlsRef.current
      if (h) {
        h.startLoad()
      } else {
        // direct / native HLS: a tiny seek re-primes the decoder
        try {
          video.currentTime = video.currentTime + 0.1
        } catch {
          /* not seekable */
        }
        video.play().catch(() => {})
      }
    }

    // Polled stall detector — measures real currentTime progress (not the
    // `buffering` flag) so legitimately slow buffering isn't mistaken for a stall.
    function watchdogTick() {
      if (cancelled || !video) return
      const now = performance.now()

      // (a) initial load never completes — metadata never arrived
      if (video.readyState < 1) {
        if (now - playStartedAtRef.current > INIT_TIMEOUT_MS) escalateReload()
        return
      }
      // (b) user-driven non-advancement (pause / seek / end) is never a stall
      if (video.paused || video.ended || video.seeking) {
        lastProgressRef.current = { t: video.currentTime, at: now }
        return
      }
      // (c) progressing normally — reset baseline; decay recovery budget after a healthy stretch
      if (video.currentTime > lastProgressRef.current.t + 0.05) {
        lastProgressRef.current = { t: video.currentTime, at: now }
        nudgedRef.current = false
        if (now - recoveryRef.current.lastReloadAt > HEALTHY_RESET_MS) {
          recoveryRef.current.reload = 0
          recoveryRef.current.media = 0
          recoveryRef.current.network = 0
        }
        return
      }
      // (d) stalled while it should be playing
      const stalledFor = now - lastProgressRef.current.at
      if (stalledFor > STALL_HARD_MS) escalateReload()
      else if (stalledFor > STALL_SOFT_MS && !nudgedRef.current) nudge()
    }

    async function init() {
      try {
        const params = new URLSearchParams({ id: itemId, hls: forceHls ? '1' : '0' })
        if (sourceId) params.set('mediaSourceId', sourceId)
        if (audioIndex != null) params.set('audio', String(audioIndex))
        if (burnSubIndex != null) params.set('subtitle', String(burnSubIndex))
        const res = await fetch(`/api/jellyfin/playback?${params.toString()}`, {
          signal: AbortSignal.any([ac.signal, AbortSignal.timeout(15_000)]),
        })
        if (!res.ok) throw new Error('No playable source')
        source = (await res.json()) as PlaybackSource
        if (cancelled || !video) return
        setPlayLabel(source.playMethodLabel)
        setTranscoding(source.transcoding)

        const nativeHls = video.canPlayType('application/vnd.apple.mpegurl') !== ''
        if (source.method === 'hls' && !nativeHls) {
          const { default: Hls } = await import('hls.js')
          if (cancelled) return
          if (Hls.isSupported()) {
            const startAt = resumeSeconds()
            const h = new Hls({
              startPosition: startAt > 0 ? startAt : -1,
              highBufferWatchdogPeriod: 2,
            }) as unknown as HlsInstance
            hls = h
            hlsRef.current = h
            h.on(Hls.Events.ERROR, (_evt, data) => onHlsError(Hls, data))
            h.loadSource(source.url)
            h.attachMedia(video)
          } else {
            video.src = source.url
          }
        } else {
          video.src = source.url
        }

        video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
        video.addEventListener('playing', onPlaying, { once: true })
        video.addEventListener('pause', onPauseReport)
        video.addEventListener('ended', onEnded)
        video.addEventListener('error', onError)

        progressTimer = setInterval(() => sendReport('progress', video.paused), 10_000)

        playStartedAtRef.current = performance.now()
        lastProgressRef.current = { t: 0, at: performance.now() }
        watchdogRef.current = setInterval(watchdogTick, 1_000)

        video.play().catch(() => {
          /* autoplay may need a gesture; the play button is shown */
        })
      } catch (e) {
        if (cancelled) return // benign cleanup abort
        const name = (e as Error).name
        setError(
          name === 'TimeoutError' || name === 'AbortError'
            ? 'Could not reach the server. Try again.'
            : (e as Error).message || 'Playback failed',
        )
      }
    }

    init()

    return () => {
      cancelled = true
      ac.abort()
      if (progressTimer) clearInterval(progressTimer)
      if (watchdogRef.current) clearInterval(watchdogRef.current)
      watchdogRef.current = null
      sendReport('stopped')
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('pause', onPauseReport)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
      hls?.destroy()
      hlsRef.current = null
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [itemId, attempt, sourceId, audioIndex, burnSubIndex])

  // --- keep the active text-subtitle track showing ------------------------
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const tracks = v.textTracks
    for (let i = 0; i < tracks.length; i++) tracks[i].mode = subtitleSrc ? 'showing' : 'disabled'
  }, [subtitleSrc, ready])

  // --- sync UI state from the media element -------------------------------
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = () => {
      isPlayingRef.current = true
      setIsPlaying(true)
      poke()
    }
    const onPause = () => {
      isPlayingRef.current = false
      setIsPlaying(false)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      setShowControls(true)
    }
    const onTime = () => setCurrentTime(v.currentTime)
    const onDuration = () => setDuration(v.duration || 0)
    const onProgress = () =>
      setBufferedEnd(v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0)
    const onWaiting = () => setBuffering(true)
    const onCanPlay = () => setBuffering(false)
    const onVolume = () => {
      setVolume(v.volume)
      setMuted(v.muted)
    }

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('durationchange', onDuration)
    v.addEventListener('progress', onProgress)
    v.addEventListener('waiting', onWaiting)
    v.addEventListener('playing', onCanPlay)
    v.addEventListener('canplay', onCanPlay)
    v.addEventListener('volumechange', onVolume)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('durationchange', onDuration)
      v.removeEventListener('progress', onProgress)
      v.removeEventListener('waiting', onWaiting)
      v.removeEventListener('playing', onCanPlay)
      v.removeEventListener('canplay', onCanPlay)
      v.removeEventListener('volumechange', onVolume)
    }
  }, [poke])

  // --- keyboard shortcuts -------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menuOpenRef.current) {
          setMenuOpen(false)
          return
        }
        onCloseRef.current()
        return
      }
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        seekBy(-10)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        seekBy(10)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const v = videoRef.current
        if (v) {
          const raw = (v.muted ? 0 : v.volume) + (e.key === 'ArrowUp' ? 0.1 : -0.1)
          const next = Math.min(1, Math.max(0, Math.round(raw * 10) / 10)) // snap off IEEE754 drift
          changeVolume(next)
          flashAction(next === 0 ? 'mute' : 'volume', `${Math.round(next * 100)}%`)
        }
      } else if (e.key === 'f') {
        toggleFullscreen()
      } else if (e.key === 'm') {
        toggleMute()
      }
      poke()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, seekBy, toggleFullscreen, toggleMute, changeVolume, flashAction, poke])

  // --- track fullscreen state ---------------------------------------------
  useEffect(() => {
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => document.removeEventListener('fullscreenchange', onFullscreen)
  }, [])

  const showSpinner = (!ready || buffering) && !error
  // Movie splash: only on the very first load (not on mid-play track-change reloads).
  const showSplash = !everReady && !error
  const controlsVisible = showControls || !isPlaying || menuOpen

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onPointerMove={poke}
      className={`fixed inset-0 z-50 bg-black ${!controlsVisible ? 'cursor-none' : ''}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        onClick={togglePlay}
        className="absolute inset-0 h-full w-full bg-black object-contain [&::cue]:bg-black/60"
      >
        {subtitleSrc && (
          <track
            key={subtitleSrc}
            kind="subtitles"
            src={subtitleSrc}
            srcLang={selectedSubTrack?.language || undefined}
            label={selectedSubTrack?.label || 'Subtitles'}
            default
          />
        )}
      </video>

      {/* Loading splash — the title's own artwork while the first frame buffers */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
          >
            {splashUrl && (
              <motion.img
                src={splashUrl}
                alt={title ?? ''}
                initial={{ scale: 1.06, opacity: 0 }}
                animate={{ scale: 1.12, opacity: 1 }}
                transition={{ opacity: { duration: 0.6 }, scale: { duration: 8, ease: 'linear' } }}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/65" />
          </motion.div>
        )}
      </AnimatePresence>

      {showSpinner && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="h-12 w-12 animate-spin rounded-full border-2 border-white/20"
            style={{ borderTopColor: 'var(--accent)' }}
          />
        </div>
      )}

      {/* Center action flash — brief state feedback on play/pause/seek/etc.
          Sits above the video/spinner (z-10) but below the chrome (z-20). */}
      <AnimatePresence>
        {flash && !error && (
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
      {/* Screen-reader announcement for keyboard/imperative actions (the badge is decorative). */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </div>

      {error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-zinc-300">{error}</p>
          <div className="flex items-center gap-4">
            <button
              onClick={retry}
              className="rounded-full px-4 py-1.5 text-sm font-medium text-black"
              style={{ background: 'var(--accent)' }}
            >
              Try again
            </button>
            <button
              onClick={() => onCloseRef.current()}
              className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <motion.div
        animate={{ opacity: controlsVisible ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 bg-gradient-to-b from-black/70 to-transparent p-4 pb-16"
      >
        <div className="flex min-w-0 items-center gap-3 pt-1.5">
          {title && (
            <p className="max-w-[55vw] truncate text-sm font-medium text-zinc-200">{title}</p>
          )}
          {playLabel && (
            <span
              title={
                transcoding
                  ? 'Jellyfin is converting this file for your browser'
                  : 'Streaming the original file unchanged'
              }
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                transcoding ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
              }`}
            >
              {playLabel}
            </span>
          )}
        </div>
        <button
          onClick={() => onCloseRef.current()}
          aria-label="Close player"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-zinc-200 transition-colors hover:bg-white/20"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current">
            <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
          </svg>
        </button>
      </motion.div>

      {/* Bottom controls */}
      {!error && (
        <motion.div
          animate={{ opacity: controlsVisible ? 1 : 0, y: controlsVisible ? 0 : 12 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-20"
        >
          <div className="flex items-center gap-3">
            <span className="w-12 text-right text-xs tabular-nums text-zinc-300">
              {formatTime(currentTime)}
            </span>
            <Slider
              ariaLabel="Seek"
              fraction={duration ? currentTime / duration : 0}
              buffered={duration ? bufferedEnd / duration : 0}
              onChange={seekToFraction}
            />
            <span className="w-12 text-xs tabular-nums text-zinc-400">{formatTime(duration)}</span>
          </div>

          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <IconButton label={isPlaying ? 'Pause' : 'Play'} onClick={togglePlay}>
                {isPlaying ? (
                  <svg viewBox="0 0 16 16" className="h-5 w-5 fill-current">
                    <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" className="h-5 w-5 fill-current">
                    <path d="M4 2.5a.5.5 0 01.768-.422l9 5.5a.5.5 0 010 .844l-9 5.5A.5.5 0 014 13.5v-11z" />
                  </svg>
                )}
              </IconButton>
              <IconButton label="Back 10 seconds" onClick={() => seekBy(-10)}>
                <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                  <path d="M9 4V1L4 5l5 4V6a4 4 0 11-4 4H3a6 6 0 106-6z" />
                </svg>
              </IconButton>
              <IconButton label="Forward 10 seconds" onClick={() => seekBy(10)}>
                <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                  <path d="M11 4V1l5 4-5 4V6a4 4 0 104 4h2a6 6 0 11-6-6z" />
                </svg>
              </IconButton>

              <div className="ml-1 flex items-center gap-2">
                <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
                  {muted || volume === 0 ? (
                    <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                      <path d="M9 4L5 7H2v6h3l4 3V4zM14.5 7.5l-2 2m0-2l2 2M17 6l-5 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M9 4L5 7H2v6h3l4 3V4z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                      <path d="M9 4L5 7H2v6h3l4 3V4z" />
                      <path d="M12.5 7a3.5 3.5 0 010 6M14.5 4.5a6.5 6.5 0 010 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  )}
                </IconButton>
                <div className="w-20">
                  <Slider ariaLabel="Volume" fraction={muted ? 0 : volume} onChange={changeVolume} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {hasTrackChoices && (
                <div className="relative" ref={menuRef}>
                  <IconButton
                    label="Audio & subtitles"
                    active={menuOpen}
                    onClick={() => {
                      setMenuOpen(o => !o)
                      poke()
                    }}
                  >
                    <svg viewBox="0 0 20 20" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
                      <path d="M5.5 11.5h3M11.5 11.5h3" />
                    </svg>
                  </IconButton>
                  <AnimatePresence>
                    {menuOpen && (
                      <TrackMenu
                        versions={versions}
                        audio={audioTracks}
                        subtitles={subtitleTracks}
                        versionId={sourceId}
                        audioIndex={audioIndex}
                        subtitleIndex={subIndex}
                        onVersion={id => selectVersion(id)}
                        onAudio={i => selectAudio(i)}
                        onSubtitle={i => selectSubtitle(i)}
                      />
                    )}
                  </AnimatePresence>
                </div>
              )}
              <IconButton label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
                {isFullscreen ? (
                  <svg viewBox="0 0 20 20" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M8 3v5H3M12 3v5h5M8 17v-5H3M12 17v-5h5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4" />
                  </svg>
                )}
              </IconButton>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
