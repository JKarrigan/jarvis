'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

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
}

type ReportKind = 'start' | 'progress' | 'stopped'

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
      <div className="absolute h-1.5 rounded-full bg-emerald-400" style={{ width: pct }} />
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
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-white/15"
    >
      {children}
    </button>
  )
}

export default function JellyfinPlayer({
  itemId,
  title,
  onClose,
}: {
  itemId: string
  title?: string
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const [attempt, setAttempt] = useState(0) // bump to retry; >0 forces HLS
  const [ready, setReady] = useState(false)
  const [buffering, setBuffering] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [playLabel, setPlayLabel] = useState<string | null>(null)
  const [transcoding, setTranscoding] = useState(false)

  const isPlayingRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- control visibility (auto-hide while playing) -----------------------
  const poke = useCallback(() => {
    setShowControls(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (isPlayingRef.current) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [])

  // --- imperative controls (stable; read the video ref directly) ----------
  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }, [])
  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta))
  }, [])
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
  }, [])
  const changeVolume = useCallback((f: number) => {
    const v = videoRef.current
    if (!v) return
    v.muted = false
    v.volume = Math.min(1, Math.max(0, f))
  }, [])
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else el.requestFullscreen?.().catch(() => {})
  }, [])

  // --- source loading + playback reporting --------------------------------
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    let hls: { destroy: () => void } | null = null
    let source: PlaybackSource | null = null
    let progressTimer: ReturnType<typeof setInterval> | null = null
    const forceHls = attempt > 0

    setReady(false)
    setBuffering(true)
    setError(null)

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
          },
        }),
        keepalive: kind === 'stopped',
      }).catch(() => {})
    }

    function onLoadedMetadata() {
      if (!video || !source) return
      const startAt = source.positionTicks > 0 ? source.positionTicks / 1e7 : 0
      if (startAt > 0 && video.currentTime < 1) {
        try {
          video.currentTime = startAt
        } catch {
          /* not seekable yet */
        }
      }
      setDuration(video.duration || source.runtimeTicks / 1e7 || 0)
      setReady(true)
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

    async function init() {
      try {
        const res = await fetch(
          `/api/jellyfin/playback?id=${encodeURIComponent(itemId)}&hls=${forceHls ? 1 : 0}`,
        )
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
            const startAt = source.positionTicks > 0 ? source.positionTicks / 1e7 : -1
            const h = new Hls({ startPosition: startAt })
            hls = h
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
        video.play().catch(() => {
          /* autoplay may need a gesture; the play button is shown */
        })
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Playback failed')
      }
    }

    init()

    return () => {
      cancelled = true
      if (progressTimer) clearInterval(progressTimer)
      sendReport('stopped')
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('pause', onPauseReport)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
      hls?.destroy()
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [itemId, attempt])

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
      } else if (e.key === 'f') {
        toggleFullscreen()
      } else if (e.key === 'm') {
        toggleMute()
      }
      poke()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, seekBy, toggleFullscreen, toggleMute, poke])

  // --- track fullscreen state ---------------------------------------------
  useEffect(() => {
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => document.removeEventListener('fullscreenchange', onFullscreen)
  }, [])

  const showSpinner = (!ready || buffering) && !error
  const controlsVisible = showControls || !isPlaying

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
        className="absolute inset-0 h-full w-full bg-black object-contain"
      />

      {showSpinner && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-zinc-300">{error}</p>
          <button
            onClick={() => onCloseRef.current()}
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Close
          </button>
        </div>
      )}

      {/* Top bar */}
      <motion.div
        animate={{ opacity: controlsVisible ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-gradient-to-b from-black/70 to-transparent p-4 pb-16"
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
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-20"
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
        </motion.div>
      )}
    </motion.div>
  )
}
