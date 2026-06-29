'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CenterFlash,
  formatTime,
  IconButton,
  IconFullscreenEnter,
  IconFullscreenExit,
  IconMuted,
  IconPause,
  IconPlay,
  IconSkipBack,
  IconSkipForward,
  IconVolume,
  Slider,
  useActionFlash,
} from '@/app/_components/media/playerUi'

function mimeForCodec(codec: string): string {
  switch (codec.toLowerCase()) {
    case 'h264': return 'video/mp4; codecs="avc1.640034, mp4a.40.2"'
    case 'hevc': case 'h265': return 'video/mp4; codecs="hev1.1.6.L153.B0, mp4a.40.2"'
    case 'vp9': return 'video/mp4; codecs="vp09.00.50.08, mp4a.40.2"'
    case 'av1': return 'video/mp4; codecs="av01.0.08M.08, mp4a.40.2"'
    default: return 'video/mp4; codecs="avc1.640034, mp4a.40.2"'
  }
}

// --- stall / recovery tuning (mirrors JellyfinPlayer) ------------------------
const STALL_SOFT_MS = 6_000 // no currentTime progress this long → cheap nudge
const STALL_HARD_MS = 15_000 // …this long → re-fetch the stream from here
const RELOAD_COOLDOWN_MS = 10_000 // min gap between reloads
const MAX_RELOADS = 2 // cap before surfacing the error UI

export function VideoPlayer({ src, className }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [buffering, setBuffering] = useState(true)
  const [error, setError] = useState<string | null>(() =>
    typeof window !== 'undefined' && !window.MediaSource
      ? 'Playback is not supported in this browser.'
      : null,
  )
  const [reloadKey, setReloadKey] = useState(0) // bump to restart the whole pipeline

  // --- UI state (mirrors the media element) -------------------------------
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)

  const isPlayingRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { flash, announce, flashAction } = useActionFlash()

  // --- streaming pipeline (MediaSource + ffmpeg) --------------------------
  useEffect(() => {
    const video = videoRef.current
    if (!video || typeof window === 'undefined' || !window.MediaSource) return

    let abort: AbortController | null = null
    let objectUrl: string | null = null
    let activeSb: SourceBuffer | null = null
    let activeMs: MediaSource | null = null
    let queue: Uint8Array[] = []
    let debounce: ReturnType<typeof setTimeout> | null = null
    let skipNextSeek = false
    let disposed = false

    // recovery state (plain locals — the effect owns one playback session)
    const lastProgress = { t: 0, at: 0 }
    let nudged = false
    const recovery = { reload: 0, lastReloadAt: 0 }

    function flush(sb: SourceBuffer) {
      if (sb.updating || queue.length === 0) return
      const chunk = queue.shift()!
      try {
        sb.appendBuffer(
          chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer,
        )
      } catch (e) {
        queue.unshift(chunk)
        // SourceBuffer is full (inevitable on a long title) — evict already-played
        // data and let the `updateend` listener re-drive flush(). Without this the
        // same chunk retries forever and playback stalls permanently.
        if ((e as Error).name === 'QuotaExceededError') {
          const cur = video!.currentTime
          if (!sb.updating && cur > 40) {
            try {
              sb.remove(0, cur - 30)
            } catch {
              /* ignore */
            }
          }
        } else {
          console.error('[VideoPlayer] appendBuffer error:', e)
        }
      }
    }

    async function startFrom(t: number) {
      abort?.abort()
      abort = null
      queue = []
      activeSb = null
      activeMs = null

      if (objectUrl) {
        video!.src = ''
        URL.revokeObjectURL(objectUrl)
        objectUrl = null
      }

      const ms = new MediaSource()
      activeMs = ms
      const url = URL.createObjectURL(ms)
      objectUrl = url
      video!.src = url

      ms.addEventListener('sourceerror', () => console.error('[VideoPlayer] MediaSource error'))

      await new Promise<void>(r => ms.addEventListener('sourceopen', () => r(), { once: true }))
      if (activeMs !== ms || disposed) return

      const ctrl = new AbortController()
      abort = ctrl

      try {
        const apiUrl = t > 0 ? `${src}&t=${t.toFixed(3)}` : src
        const res = await fetch(apiUrl, { signal: ctrl.signal })
        if (activeMs !== ms || disposed) return
        if (!res.ok) {
          setError('This file could not be played.')
          return
        }
        if (!res.body) return

        const mime = mimeForCodec(res.headers.get('X-Video-Codec') ?? '')
        const dur = parseFloat(res.headers.get('X-Duration-Seconds') ?? '0')

        // Codec guard: surface a clear message instead of a silently frozen frame
        // when the browser can't decode this codec in MSE (e.g. HEVC).
        if (!MediaSource.isTypeSupported(mime)) {
          res.body.cancel()
          setError('This file can’t be played in the browser.')
          return
        }

        let sb: SourceBuffer
        try {
          sb = ms.addSourceBuffer(mime)
        } catch (err) {
          console.error('[VideoPlayer] addSourceBuffer failed:', err)
          res.body.cancel()
          setError('This file can’t be played in the browser.')
          return
        }
        activeSb = sb
        sb.addEventListener('updateend', () => flush(sb))

        if (dur > 0 && isFinite(dur)) {
          try {
            ms.duration = dur
          } catch {
            /* ignore */
          }
        }

        if (t > 0) {
          skipNextSeek = true
          video!.currentTime = t
        }

        const reader = res.body.getReader()
        while (true) {
          const { value, done } = await reader.read()
          if (ctrl.signal.aborted || disposed) return
          if (done) break
          queue.push(value)
          flush(sb)
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError' && !disposed) {
          console.error('[VideoPlayer] stream error:', e)
          setError('Playback failed.')
        }
      }
    }

    // Re-fetch the stream from the current position, bounded so a wedged
    // transcode can't loop forever.
    function reloadFromCurrent() {
      const now = performance.now()
      if (now - recovery.lastReloadAt < RELOAD_COOLDOWN_MS) return
      if (recovery.reload >= MAX_RELOADS) {
        setError('Playback keeps stalling. Try again.')
        return
      }
      recovery.reload++
      recovery.lastReloadAt = now
      startFrom(video!.currentTime)
    }

    function watchdogTick() {
      if (disposed || !video) return
      const now = performance.now()
      // not playing for a legitimate reason → reset baseline
      if (video.readyState < 1 || video.paused || video.ended || video.seeking) {
        lastProgress.t = video.currentTime
        lastProgress.at = now
        return
      }
      // progressing → reset baseline
      if (video.currentTime > lastProgress.t + 0.05) {
        lastProgress.t = video.currentTime
        lastProgress.at = now
        nudged = false
        return
      }
      // stalled while it should be playing
      const stalledFor = now - lastProgress.at
      if (stalledFor > STALL_HARD_MS) {
        reloadFromCurrent()
      } else if (stalledFor > STALL_SOFT_MS && !nudged) {
        nudged = true
        video.play().catch(() => {})
      }
    }

    function onSeeking() {
      if (skipNextSeek) {
        skipNextSeek = false
        return
      }
      if (!activeSb) return
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        const tt = video!.currentTime
        const buf = video!.buffered
        for (let i = 0; i < buf.length; i++) {
          if (tt >= buf.start(i) - 0.5 && tt <= buf.end(i) + 0.5) return // already buffered
        }
        startFrom(tt)
      }, 200)
    }

    video.addEventListener('seeking', onSeeking)

    lastProgress.t = 0
    lastProgress.at = performance.now()
    const watchdog = setInterval(watchdogTick, 1_000)

    startFrom(0)

    return () => {
      disposed = true
      clearInterval(watchdog)
      if (debounce) clearTimeout(debounce)
      abort?.abort()
      video.removeEventListener('seeking', onSeeking)
      video.src = ''
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, reloadKey])

  // --- control visibility (auto-hide while playing) -----------------------
  const poke = useCallback(() => {
    setShowControls(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (isPlayingRef.current) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [])
  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    },
    [],
  )

  // --- sync UI state from the media element (listeners persist across reloads) ---
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
    const onVideoError = () => console.error('[VideoPlayer] video error:', v.error)

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('durationchange', onDuration)
    v.addEventListener('progress', onProgress)
    v.addEventListener('waiting', onWaiting)
    v.addEventListener('playing', onCanPlay)
    v.addEventListener('canplay', onCanPlay)
    v.addEventListener('volumechange', onVolume)
    v.addEventListener('error', onVideoError)
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
      v.removeEventListener('error', onVideoError)
    }
  }, [poke])

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

  // --- track fullscreen state ---------------------------------------------
  useEffect(() => {
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => document.removeEventListener('fullscreenchange', onFullscreen)
  }, [])

  // Focus the player so keyboard shortcuts work immediately (and so our handler,
  // not the file-preview modal's window listener, receives the arrow keys).
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  // Keyboard shortcuts — scoped to the container. We stopPropagation on keys we
  // handle so the surrounding preview modal's Arrow navigation doesn't also fire.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const handled = new Set([' ', 'k', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'f', 'm'])
    if (!handled.has(e.key)) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === ' ' || e.key === 'k') {
      togglePlay()
    } else if (e.key === 'ArrowLeft') {
      seekBy(-10)
    } else if (e.key === 'ArrowRight') {
      seekBy(10)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const v = videoRef.current
      if (v) {
        const raw = (v.muted ? 0 : v.volume) + (e.key === 'ArrowUp' ? 0.1 : -0.1)
        const next = Math.min(1, Math.max(0, Math.round(raw * 10) / 10))
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

  const retry = () => {
    setError(null)
    setBuffering(true)
    setReloadKey(k => k + 1)
  }

  const controlsVisible = showControls || !isPlaying

  return (
    <div
      ref={containerRef}
      onPointerMove={poke}
      onKeyDown={onKeyDown}
      tabIndex={-1}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-black outline-none ${
        !controlsVisible ? 'cursor-none' : ''
      } ${className ?? ''}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        onClick={togglePlay}
        onPointerDown={() => containerRef.current?.focus()}
        className="absolute inset-0 h-full w-full bg-black object-contain"
      />

      {buffering && !error && !flash && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300" />
        </div>
      )}

      {/* Center action flash — brief state feedback on play/pause/seek/etc. */}
      <CenterFlash flash={flash} announce={announce} suppressed={Boolean(error)} />

      {error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-zinc-300">{error}</p>
          <button
            onClick={retry}
            className="rounded-full bg-zinc-200 px-4 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
          >
            Try again
          </button>
        </div>
      )}

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
                {isPlaying ? <IconPause /> : <IconPlay />}
              </IconButton>
              <IconButton label="Back 10 seconds" onClick={() => seekBy(-10)}>
                <IconSkipBack />
              </IconButton>
              <IconButton label="Forward 10 seconds" onClick={() => seekBy(10)}>
                <IconSkipForward />
              </IconButton>

              <div className="ml-1 flex items-center gap-2">
                <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
                  {muted || volume === 0 ? <IconMuted /> : <IconVolume />}
                </IconButton>
                <div className="w-20">
                  <Slider ariaLabel="Volume" fraction={muted ? 0 : volume} onChange={changeVolume} />
                </div>
              </div>
            </div>

            <IconButton label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
              {isFullscreen ? <IconFullscreenExit /> : <IconFullscreenEnter />}
            </IconButton>
          </div>
        </motion.div>
      )}
    </div>
  )
}
