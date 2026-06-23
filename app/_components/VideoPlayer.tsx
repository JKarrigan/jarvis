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

    let abort: AbortController | null = null
    let objectUrl: string | null = null
    let activeSb: SourceBuffer | null = null
    let activeMs: MediaSource | null = null
    let queue: Uint8Array[] = []
    let debounce: ReturnType<typeof setTimeout> | null = null
    let skipNextSeek = false

    function flush(sb: SourceBuffer) {
      if (sb.updating || queue.length === 0) return
      const chunk = queue.shift()!
      try {
        sb.appendBuffer(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer)
      } catch (e) {
        queue.unshift(chunk)
        console.error('[VP] appendBuffer error:', e)
      }
    }

    async function startFrom(t: number) {
      console.log(`[VP] startFrom(${t.toFixed(2)})`)

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

      ms.addEventListener('sourceclose', () => console.log('[VP] MediaSource closed unexpectedly'))
      ms.addEventListener('sourceerror', () => console.error('[VP] MediaSource error'))

      console.log('[VP] waiting for sourceopen...')
      await new Promise<void>(r => ms.addEventListener('sourceopen', () => r(), { once: true }))
      if (activeMs !== ms) { console.log('[VP] superseded before sourceopen completed'); return }
      console.log('[VP] sourceopen fired, ms.readyState:', ms.readyState)

      const ctrl = new AbortController()
      abort = ctrl

      try {
        const apiUrl = t > 0 ? `${src}&t=${t.toFixed(3)}` : src
        console.log('[VP] fetching:', apiUrl)
        const res = await fetch(apiUrl, { signal: ctrl.signal })
        console.log('[VP] fetch response:', res.status, 'ok:', res.ok)
        console.log('[VP] X-Video-Codec:', res.headers.get('X-Video-Codec'))
        console.log('[VP] X-Duration-Seconds:', res.headers.get('X-Duration-Seconds'))

        if (!res.ok || !res.body || activeMs !== ms) {
          console.log('[VP] aborting: res.ok =', res.ok, 'activeMs match =', activeMs === ms)
          return
        }

        const mime = mimeForCodec(res.headers.get('X-Video-Codec') ?? '')
        const dur = parseFloat(res.headers.get('X-Duration-Seconds') ?? '0')
        console.log('[VP] mime:', mime, '  duration:', dur)
        console.log('[VP] MediaSource.isTypeSupported:', MediaSource.isTypeSupported(mime))

        let sb: SourceBuffer
        try {
          sb = ms.addSourceBuffer(mime)
          console.log('[VP] SourceBuffer created, mode:', sb.mode)
        } catch (err) {
          console.error('[VP] addSourceBuffer failed:', err)
          res.body.cancel()
          return
        }
        activeSb = sb

        sb.addEventListener('error', (e) => console.error('[VP] SourceBuffer error event:', e))
        sb.addEventListener('abort', () => console.warn('[VP] SourceBuffer abort event'))

        if (dur > 0 && isFinite(dur)) {
          try { ms.duration = dur; console.log('[VP] ms.duration set to', dur) }
          catch (e) { console.error('[VP] failed to set ms.duration:', e) }
        }

        if (t > 0) {
          console.log('[VP] setting video.currentTime =', t)
          skipNextSeek = true
          video!.currentTime = t
          console.log('[VP] video.currentTime is now:', video!.currentTime, 'seeking:', video!.seeking)
        }

        sb.addEventListener('updateend', () => flush(sb))

        let chunkCount = 0
        const reader = res.body.getReader()
        while (true) {
          const { value, done } = await reader.read()
          if (ctrl.signal.aborted) { console.log('[VP] stream aborted after', chunkCount, 'chunks'); return }
          if (done) { console.log('[VP] stream done after', chunkCount, 'chunks'); break }
          chunkCount++
          if (chunkCount <= 3) console.log(`[VP] chunk #${chunkCount} size:`, value.byteLength)
          queue.push(value)
          flush(sb)
        }
        console.log('[VP] buffered ranges:', Array.from({ length: video!.buffered.length }, (_, i) =>
          `[${video!.buffered.start(i).toFixed(1)}, ${video!.buffered.end(i).toFixed(1)}]`).join(', '))
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.error('[VP] fetch error:', e)
      }
    }

    video.addEventListener('seeking', () => console.log('[VP] video seeking event, currentTime:', video.currentTime, 'buffered ranges:', Array.from({ length: video.buffered.length }, (_, i) => `[${video.buffered.start(i).toFixed(1)}, ${video.buffered.end(i).toFixed(1)}]`).join(', ')))
    video.addEventListener('seeked', () => console.log('[VP] video seeked event, currentTime:', video.currentTime))
    video.addEventListener('error', () => console.error('[VP] video error:', video.error))
    video.addEventListener('waiting', () => console.log('[VP] video waiting, currentTime:', video.currentTime))

    function onSeeking() {
      if (skipNextSeek) { console.log('[VP] onSeeking: skipping (internal seek)'); skipNextSeek = false; return }
      if (!activeSb) { console.log('[VP] onSeeking: no activeSb yet, ignoring'); return }

      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        const t = video!.currentTime
        const buf = video!.buffered
        console.log('[VP] debounced seek check: t =', t.toFixed(2), 'buffered:', Array.from({ length: buf.length }, (_, i) => `[${buf.start(i).toFixed(1)}, ${buf.end(i).toFixed(1)}]`).join(', '))
        for (let i = 0; i < buf.length; i++) {
          if (t >= buf.start(i) - 0.5 && t <= buf.end(i) + 0.5) {
            console.log('[VP] seek target already buffered, no action needed')
            return
          }
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
