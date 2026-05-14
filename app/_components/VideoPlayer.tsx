'use client'

import { useEffect, useRef } from 'react'

function mimeForCodec(codec: string): string {
  switch (codec.toLowerCase()) {
    case 'h264': return 'video/mp4; codecs="avc1.640034, mp4a.40.2"'
    case 'hevc': case 'h265': return 'video/mp4; codecs="hev1.1.6.L153.B0, mp4a.40.2"'
    case 'vp9': return 'video/mp4; codecs="vp09.00.50.08, mp4a.40.2"'
    case 'av1': return 'video/mp4; codecs="av01.0.08M.08, mp4a.40.2"'
    default: return 'video/mp4; codecs="avc1.640034, mp4a.40.2"'
  }
}

export function VideoPlayer({ src, className }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || typeof window === 'undefined' || !window.MediaSource) return

    // Mutable player state — replaced entirely on each seek
    let abort: AbortController | null = null
    let objectUrl: string | null = null
    let activeSb: SourceBuffer | null = null
    let activeMs: MediaSource | null = null
    let queue: Uint8Array[] = []
    let debounce: ReturnType<typeof setTimeout> | null = null
    let skipNextSeek = false  // suppress the seeking event we fire ourselves

    function flush(sb: SourceBuffer) {
      if (sb.updating || queue.length === 0) return
      const chunk = queue.shift()!
      try {
        sb.appendBuffer(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer)
      } catch (e) {
        queue.unshift(chunk)
        if ((e as Error).name !== 'QuotaExceededError') console.error('[VideoPlayer] appendBuffer:', e)
      }
    }

    async function startFrom(t: number) {
      // --- tear down previous player ---
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

      // --- build new MediaSource ---
      const ms = new MediaSource()
      activeMs = ms
      const url = URL.createObjectURL(ms)
      objectUrl = url
      video!.src = url

      await new Promise<void>(r => ms.addEventListener('sourceopen', () => r(), { once: true }))
      if (activeMs !== ms) return  // another startFrom() won the race

      const ctrl = new AbortController()
      abort = ctrl

      try {
        const apiUrl = t > 0 ? `${src}&t=${t.toFixed(3)}` : src
        const res = await fetch(apiUrl, { signal: ctrl.signal })
        if (!res.ok || !res.body || activeMs !== ms) return

        const mime = mimeForCodec(res.headers.get('X-Video-Codec') ?? '')
        const dur = parseFloat(res.headers.get('X-Duration-Seconds') ?? '0')

        let sb: SourceBuffer
        try { sb = ms.addSourceBuffer(mime) }
        catch { console.error('[VideoPlayer] addSourceBuffer failed:', mime); res.body.cancel(); return }
        activeSb = sb

        if (dur > 0 && isFinite(dur)) try { ms.duration = dur } catch {}

        // Jump playhead to seek position — suppress the resulting seeking event
        if (t > 0) { skipNextSeek = true; video!.currentTime = t }

        sb.addEventListener('updateend', () => flush(sb))

        const reader = res.body.getReader()
        while (true) {
          const { value, done } = await reader.read()
          if (ctrl.signal.aborted) return
          if (done) break
          queue.push(value)
          flush(sb)
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.error('[VideoPlayer] fetch:', e)
      }
    }

    function onSeeking() {
      // Ignore seeks we triggered ourselves (video.currentTime = t in startFrom)
      if (skipNextSeek) { skipNextSeek = false; return }
      if (!activeSb) return

      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        const t = video!.currentTime
        const buf = video!.buffered
        for (let i = 0; i < buf.length; i++) {
          if (t >= buf.start(i) - 0.5 && t <= buf.end(i) + 0.5) return
        }
        startFrom(t)
      }, 200)
    }

    video.addEventListener('seeking', onSeeking)
    startFrom(0)

    return () => {
      if (debounce) clearTimeout(debounce)
      abort?.abort()
      video.removeEventListener('seeking', onSeeking)
      video.src = ''
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      className={className ?? 'max-h-full max-w-full rounded-lg'}
    />
  )
}
