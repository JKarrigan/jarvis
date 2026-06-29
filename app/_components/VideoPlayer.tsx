'use client'

import { useEffect, useRef, useState } from 'react'

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
  const [buffering, setBuffering] = useState(true)
  const [error, setError] = useState<string | null>(() =>
    typeof window !== 'undefined' && !window.MediaSource
      ? 'Playback is not supported in this browser.'
      : null,
  )
  const [reloadKey, setReloadKey] = useState(0) // bump to restart the whole pipeline

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

    const onWaiting = () => setBuffering(true)
    const onPlaying = () => setBuffering(false)
    const onCanPlay = () => setBuffering(false)
    const onVideoError = () => console.error('[VideoPlayer] video error:', video.error)

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

    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('error', onVideoError)
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
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('error', onVideoError)
      video.removeEventListener('seeking', onSeeking)
      video.src = ''
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, reloadKey])

  const retry = () => {
    setError(null)
    setBuffering(true)
    setReloadKey(k => k + 1)
  }

  return (
    <div className={`relative flex h-full w-full items-center justify-center ${className ?? ''}`}>
      <video ref={videoRef} controls autoPlay className="max-h-full max-w-full rounded-lg" />

      {buffering && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-zinc-300">{error}</p>
          <button
            onClick={retry}
            className="rounded-full bg-zinc-200 px-4 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
