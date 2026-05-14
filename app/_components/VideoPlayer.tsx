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

    const ms = new MediaSource()
    const objectUrl = URL.createObjectURL(ms)
    video.src = objectUrl

    let sb: SourceBuffer | null = null
    let abort: AbortController | null = null
    let queue: Uint8Array[] = []
    let debounce: ReturnType<typeof setTimeout> | null = null

    function flush() {
      if (!sb || sb.updating || queue.length === 0) return
      try {
        const chunk = queue.shift()!
        sb.appendBuffer(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer)
      } catch (e) {
        console.error('[VideoPlayer] appendBuffer:', e)
      }
    }

    async function pipeBody(reader: ReadableStreamDefaultReader<Uint8Array>, ctrl: AbortController) {
      while (true) {
        const { value, done } = await reader.read()
        if (ctrl.signal.aborted) return
        if (done) break
        queue.push(value)
        flush()
      }
    }

    async function streamSeek(t: number) {
      abort?.abort()
      queue = []
      const ctrl = new AbortController()
      abort = ctrl

      try {
        const res = await fetch(`${src}&t=${t.toFixed(3)}`, { signal: ctrl.signal })
        if (!res.ok || !res.body) return
        await pipeBody(res.body.getReader(), ctrl)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.error('[VideoPlayer] seek fetch:', e)
      }
    }

    function restartAt(t: number) {
      abort?.abort()
      queue = []
      if (!sb || ms.readyState !== 'open') { streamSeek(t); return }

      const doRemove = () => {
        if (sb!.updating) { sb!.addEventListener('updateend', doRemove, { once: true }); return }
        try {
          const b = sb!.buffered
          if (b.length > 0) {
            const end = isFinite(ms.duration) && ms.duration > 0
              ? Math.min(b.end(b.length - 1) + 1, ms.duration)
              : b.end(b.length - 1) + 1
            sb!.remove(b.start(0), end)
            sb!.addEventListener('updateend', () => streamSeek(t), { once: true })
          } else {
            streamSeek(t)
          }
        } catch { streamSeek(t) }
      }
      doRemove()
    }

    ms.addEventListener('sourceopen', async () => {
      const ctrl = new AbortController()
      abort = ctrl

      try {
        const res = await fetch(src, { signal: ctrl.signal })
        if (!res.ok || !res.body) return

        const codec = res.headers.get('X-Video-Codec') ?? ''
        const dur = parseFloat(res.headers.get('X-Duration-Seconds') ?? '0')
        const mime = mimeForCodec(codec)

        try { sb = ms.addSourceBuffer(mime) }
        catch { console.error('[VideoPlayer] addSourceBuffer failed:', mime); res.body.cancel(); return }

        sb.addEventListener('updateend', flush)

        if (dur > 0 && isFinite(dur)) {
          try { ms.duration = dur } catch {}
        }

        await pipeBody(res.body.getReader(), ctrl)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.error('[VideoPlayer] initial fetch:', e)
      }
    })

    function onSeeking() {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        const t = video!.currentTime
        const buf = video!.buffered
        for (let i = 0; i < buf.length; i++) {
          if (t >= buf.start(i) - 0.5 && t <= buf.end(i) + 0.5) return
        }
        restartAt(t)
      }, 200)
    }

    video.addEventListener('seeking', onSeeking)

    return () => {
      if (debounce) clearTimeout(debounce)
      abort?.abort()
      video.removeEventListener('seeking', onSeeking)
      URL.revokeObjectURL(objectUrl)
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
