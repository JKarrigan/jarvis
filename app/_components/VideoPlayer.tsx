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

const AUDIO_CODEC = 'mp4a.40.2'

/**
 * MSE mime type for the server's remux (video copied, audio → AAC), or null
 * for a codec we don't know how to describe — that is reported as unsupported
 * rather than guessed as H.264 (a wrong guess decodes to a frozen frame).
 */
function mimeForCodec(codec: string, hasAudio: boolean): string | null {
  let video: string
  switch (codec.toLowerCase()) {
    case 'h264': video = 'avc1.640034'; break
    case 'hevc': case 'h265': video = 'hev1.1.6.L153.B0'; break
    case 'vp9': video = 'vp09.00.50.08'; break
    case 'av1': video = 'av01.0.08M.08'; break
    default: return null
  }
  return `video/mp4; codecs="${hasAudio ? `${video}, ${AUDIO_CODEC}` : video}"`
}

// --- stall / recovery tuning (mirrors JellyfinPlayer) ------------------------
const STALL_SOFT_MS = 6_000 // no currentTime progress this long → cheap nudge
const STALL_HARD_MS = 15_000 // …this long → re-fetch the stream from here
const RELOAD_COOLDOWN_MS = 10_000 // min gap between reloads
const MAX_RELOADS = 2 // cap before surfacing the error UI
const RELOAD_RESET_SEC = 30 // this much smooth playback after a reload clears the count

// --- buffering limits ----------------------------------------------------------
// The read loop pauses while either is exceeded, so a long title streams at
// playback pace instead of being pulled into tab memory as fast as the network
// allows (the server then blocks ffmpeg in turn).
const MAX_QUEUED_BYTES = 16 * 1024 * 1024 // fetched but not yet appended
const MAX_AHEAD_SEC = 60 // appended ahead of the playhead
const BEHIND_KEEP_SEC = 10 // kept behind the playhead when the SourceBuffer is full
const BUSY_RETRIES = 3 // 503 (slots busy) / 504 (slow start) retries before giving up

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
  const [notice, setNotice] = useState<string | null>(null) // transient status under the spinner

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
    const v = video

    let abort: AbortController | null = null
    let objectUrl: string | null = null
    let activeSb: SourceBuffer | null = null
    let debounce: ReturnType<typeof setTimeout> | null = null
    let skipNextSeek = false
    let disposed = false

    // recovery state (plain locals — the effect owns one playback session)
    const lastProgress = { t: 0, at: 0 }
    let nudged = false
    const recovery = { reload: 0, lastReloadAt: 0, playedSinceReload: 0 }

    /** Seconds buffered contiguously ahead of the playhead. */
    function bufferedAhead(): number {
      const t = v.currentTime
      const buf = v.buffered
      for (let i = 0; i < buf.length; i++) {
        if (t >= buf.start(i) - 0.5 && t <= buf.end(i) + 0.5) return Math.max(0, buf.end(i) - t)
      }
      return 0
    }

    async function startFrom(t: number) {
      abort?.abort()
      abort = null
      activeSb = null

      if (objectUrl) {
        v.removeAttribute('src')
        v.load()
        URL.revokeObjectURL(objectUrl)
        objectUrl = null
      }

      const ms = new MediaSource()
      const url = URL.createObjectURL(ms)
      objectUrl = url
      v.src = url

      ms.addEventListener('sourceerror', () => console.error('[VideoPlayer] MediaSource error'))

      // This session's own abort controller, created up front so a newer
      // startFrom() or unmount cancels it even while waiting for sourceopen.
      const ctrl = new AbortController()
      abort = ctrl
      const live = () => !ctrl.signal.aborted && !disposed

      await new Promise<void>(r => {
        ms.addEventListener('sourceopen', () => r(), { once: true })
        ctrl.signal.addEventListener('abort', () => r(), { once: true })
      })
      if (!live()) return

      // Per-session queue of fetched-but-not-appended chunks.
      const queue: Uint8Array[] = []
      let queuedBytes = 0
      let sb: SourceBuffer | null = null

      // Wake-ups for the read loop: playback progress, appends finishing, or abort.
      let wakeFn: (() => void) | null = null
      const wake = () => { const f = wakeFn; wakeFn = null; f?.() }
      const nextWake = () => new Promise<void>(r => {
        wakeFn = r
        setTimeout(r, 1_000) // safety net — never wait on an event that won't come
      })
      const onTimeUpdate = () => {
        if (sb) flush(sb) // retries an append that hit the quota while the playhead was near 0
        wake()
      }
      v.addEventListener('timeupdate', onTimeUpdate)
      v.addEventListener('seeking', wake)
      ctrl.signal.addEventListener('abort', wake, { once: true })

      function flush(buf: SourceBuffer) {
        if (!live() || buf.updating || queue.length === 0 || ms.readyState !== 'open') return
        const chunk = queue[0]
        try {
          buf.appendBuffer(chunk as Uint8Array<ArrayBuffer>)
          queue.shift()
          queuedBytes -= chunk.byteLength
        } catch (e) {
          if ((e as Error).name !== 'QuotaExceededError') {
            console.error('[VideoPlayer] appendBuffer error:', e)
            return
          }
          // SourceBuffer is full: evict what is well behind the playhead and let
          // `updateend` re-drive flush(). With nothing to evict yet (playhead
          // near the start), wait for playback to advance — timeupdate retries.
          const cur = v.currentTime
          const b = v.buffered
          if (cur > BEHIND_KEEP_SEC && b.length > 0 && b.start(0) < cur - BEHIND_KEEP_SEC - 1) {
            try {
              buf.remove(0, cur - BEHIND_KEEP_SEC)
            } catch {
              /* ignore */
            }
          }
        }
      }

      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
      try {
        const apiUrl = t > 0 ? `${src}&t=${t.toFixed(3)}` : src
        let res = await fetch(apiUrl, { signal: ctrl.signal })
        // 503 = all transcode slots busy (e.g. the previous stream's ffmpeg is
        // still exiting after a seek), 504 = no first byte in time: both are
        // retryable after Retry-After.
        for (let i = 0; (res.status === 503 || res.status === 504) && i < BUSY_RETRIES; i++) {
          res.body?.cancel().catch(() => {})
          setNotice('Server busy, retrying…')
          const wait = Math.min(10, Math.max(1, Number(res.headers.get('Retry-After')) || 2))
          await new Promise(r => setTimeout(r, wait * 1000))
          if (!live()) return
          res = await fetch(apiUrl, { signal: ctrl.signal })
        }
        if (!live()) return
        setNotice(null)
        if (res.status === 503 || res.status === 504) {
          setError('The server is busy. Try again in a moment.')
          return
        }
        if (!res.ok || !res.body) {
          setError(res.status >= 500 ? 'This file can’t be played.' : 'This file could not be played.')
          return
        }

        const hasAudio = res.headers.get('X-Has-Audio') !== '0'
        const mime = mimeForCodec(res.headers.get('X-Video-Codec') ?? '', hasAudio)
        const dur = parseFloat(res.headers.get('X-Duration-Seconds') ?? '0')

        // Codec guard: surface a clear message instead of a silently frozen frame
        // when the codec is unknown or the browser can't decode it in MSE (e.g. HEVC).
        if (!mime || !MediaSource.isTypeSupported(mime)) {
          res.body.cancel().catch(() => {})
          setError('This file can’t be played in the browser.')
          return
        }

        try {
          sb = ms.addSourceBuffer(mime)
        } catch (err) {
          console.error('[VideoPlayer] addSourceBuffer failed:', err)
          res.body.cancel().catch(() => {})
          setError('This file can’t be played in the browser.')
          return
        }
        const buf = sb
        activeSb = buf
        buf.addEventListener('updateend', () => {
          flush(buf)
          wake()
        })

        if (dur > 0 && isFinite(dur)) {
          try {
            ms.duration = dur
          } catch {
            /* ignore */
          }
        }

        if (t > 0) {
          skipNextSeek = true
          v.currentTime = t
        }

        reader = res.body.getReader()
        while (true) {
          // Backpressure: don't read further while plenty is queued or buffered.
          while (live() && (queuedBytes > MAX_QUEUED_BYTES || bufferedAhead() > MAX_AHEAD_SEC)) {
            await nextWake()
          }
          if (!live()) return
          const { value, done } = await reader.read()
          if (!live()) return
          if (done) break
          queue.push(value)
          queuedBytes += value.byteLength
          flush(buf)
        }

        // Stream complete: once everything is appended, mark the end so the
        // element reaches `ended` instead of stalling on the last frame.
        while (live() && (queue.length > 0 || buf.updating)) {
          flush(buf)
          await nextWake()
        }
        if (live() && ms.readyState === 'open') {
          try {
            ms.endOfStream()
          } catch (e) {
            console.error('[VideoPlayer] endOfStream failed:', e)
          }
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError' && live()) {
          console.error('[VideoPlayer] stream error:', e)
          setError('Playback failed.')
        }
      } finally {
        reader?.cancel().catch(() => {})
        v.removeEventListener('timeupdate', onTimeUpdate)
        v.removeEventListener('seeking', wake)
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
      recovery.playedSinceReload = 0
      void startFrom(v.currentTime)
    }

    function watchdogTick() {
      if (disposed) return
      const now = performance.now()
      // not playing for a legitimate reason → reset baseline
      if (v.readyState < 1 || v.paused || v.ended || v.seeking) {
        lastProgress.t = v.currentTime
        lastProgress.at = now
        return
      }
      // progressing → reset baseline (and, after enough smooth playback, the reload budget)
      if (v.currentTime > lastProgress.t + 0.05) {
        recovery.playedSinceReload += v.currentTime - lastProgress.t
        if (recovery.playedSinceReload > RELOAD_RESET_SEC) recovery.reload = 0
        lastProgress.t = v.currentTime
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
        v.play().catch(() => {})
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
        const tt = v.currentTime
        const buf = v.buffered
        for (let i = 0; i < buf.length; i++) {
          if (tt >= buf.start(i) - 0.5 && tt <= buf.end(i) + 0.5) return // already buffered
        }
        void startFrom(tt)
      }, 200)
    }

    v.addEventListener('seeking', onSeeking)

    lastProgress.t = 0
    lastProgress.at = performance.now()
    const watchdog = setInterval(watchdogTick, 1_000)

    void startFrom(0)

    return () => {
      disposed = true
      clearInterval(watchdog)
      if (debounce) clearTimeout(debounce)
      abort?.abort()
      v.removeEventListener('seeking', onSeeking)
      v.removeAttribute('src')
      v.load()
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
    setNotice(null)
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
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300" />
          {notice && <p className="text-xs text-zinc-400">{notice}</p>}
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
