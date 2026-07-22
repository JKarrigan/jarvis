'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export interface PreviewSource {
  url: string
  method: 'direct' | 'hls'
  startAt: number
}

/** A resolved playback session cached across clip rotations / repeat hovers. */
export interface CachedPlayback {
  url: string
  method: 'direct' | 'hls'
  runtimeTicks: number
  playSessionId: string
}

/** Muted ambient stream for a backdrop. Direct sources start at the random
    point via a #t media fragment; HLS sources go through hls.js (same as the player).
    Tearing down stops all segment requests — Jellyfin reaps the idle transcode on
    its own, and the clip never reports playback progress. */
export function ClipVideo({ source, onPlaying }: { source: PreviewSource; onPlaying?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  // Ref'd so a changing callback doesn't tear down and restart the stream.
  const onPlayingRef = useRef(onPlaying)
  useEffect(() => { onPlayingRef.current = onPlaying }, [onPlaying])

  useEffect(() => {
    const video = ref.current
    if (!video) return
    let hls: { destroy(): void } | undefined
    let cancelled = false
    const handlePlaying = () => onPlayingRef.current?.()
    video.addEventListener('playing', handlePlaying)
    if (source.method === 'direct') {
      video.src = `${source.url}#t=${source.startAt}`
      video.play().catch(() => {})
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled || !ref.current) return
        if (Hls.isSupported()) {
          hls = new Hls({ startPosition: source.startAt })
          ;(hls as InstanceType<typeof Hls>).loadSource(source.url)
          ;(hls as InstanceType<typeof Hls>).attachMedia(video)
          video.play().catch(() => {})
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = source.url
          video.currentTime = source.startAt
          video.play().catch(() => {})
        }
      })
    }
    return () => {
      cancelled = true
      video.removeEventListener('playing', handlePlaying)
      hls?.destroy()
      video.removeAttribute('src')
      video.load()
    }
  }, [source])

  return <video ref={ref} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
}

/** Random point between 10% and 70% of the runtime — skips titles and avoids
    ending spoilers. Very short runtimes just start at the beginning. */
export function rollStartAt(runtimeSeconds: number): number {
  return runtimeSeconds > 120 ? Math.floor(runtimeSeconds * (0.1 + 0.6 * Math.random())) : 0
}

/** Transcoded (HLS) clips leave ffmpeg running on the NAS after the last segment
    request — tell the server to kill the encoding. No-op for direct play. */
export function releasePlaybackEncoding(src: Pick<CachedPlayback, 'method' | 'playSessionId'> | null | undefined): void {
  if (src?.method !== 'hls') return
  fetch(`/api/jellyfin/playback?playSessionId=${encodeURIComponent(src.playSessionId)}`, {
    method: 'DELETE',
    keepalive: true,
  }).catch(() => {})
}

/** Ambient rotating background clip for an item: waits startDelayMs before
    resolving a stream (so rapid item changes make zero network calls), then
    crossfades to a new random point in the title every rotateMs. Renders nothing
    until a clip is playing — the static backdrop behind it stays visible. */
export function AmbientClip({
  itemId, startDelayMs = 1000, rotateMs = 10_000,
}: { itemId: string; startDelayMs?: number; rotateMs?: number }) {
  const [clip, setClip] = useState<PreviewSource | null>(null)
  // undefined = not resolved yet, null = no playable source (mock mode / 404)
  const sourceRef = useRef<CachedPlayback | null | undefined>(undefined)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false
    let startTimer: ReturnType<typeof setTimeout> | undefined
    let rotateTimer: ReturnType<typeof setInterval> | undefined
    setClip(null)
    sourceRef.current = undefined

    async function begin() {
      if (sourceRef.current === undefined) {
        try {
          const res = await fetch(`/api/jellyfin/playback?id=${itemId}`)
          const source = res.ok ? await res.json() : null
          sourceRef.current = source?.url
            ? { url: source.url, method: source.method, runtimeTicks: source.runtimeTicks, playSessionId: source.playSessionId }
            : null
        } catch {
          sourceRef.current = null
        }
      }
      const src = sourceRef.current
      if (cancelled || !src) return
      const runtime = src.runtimeTicks / 10_000_000
      setClip({ url: src.url, method: src.method, startAt: rollStartAt(runtime) })
      if (runtime > 120) {
        rotateTimer = setInterval(() => {
          setClip(c => {
            let next = rollStartAt(runtime)
            // The AnimatePresence key includes startAt — nudge so it always changes.
            if (c && next === c.startAt) next += 30
            return { url: src.url, method: src.method, startAt: next }
          })
        }, rotateMs)
      }
    }

    function stop() {
      clearTimeout(startTimer)
      clearInterval(rotateTimer)
      setClip(null)
      releasePlaybackEncoding(sourceRef.current)
      // A killed HLS session can't be resumed; the next start resolves a fresh one.
      if (sourceRef.current?.method === 'hls') sourceRef.current = undefined
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') stop()
      else startTimer = setTimeout(begin, startDelayMs)
    }

    startTimer = setTimeout(begin, startDelayMs)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [itemId, startDelayMs, rotateMs])
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <AnimatePresence>
      {clip && <ClipLayer key={`${clip.url}#${clip.startAt}`} source={clip} />}
    </AnimatePresence>
  )
}

/** One clip in the crossfade stack. Fades in only once the video is actually
    rendering frames — fading on mount would blend in a still-black element.
    The outgoing layer keeps playing while it fades, so clip-to-clip rotations
    dissolve into each other instead of dipping through the backdrop. */
function ClipLayer({ source }: { source: PreviewSource }) {
  const [ready, setReady] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: ready ? 1 : 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.4, ease: 'easeInOut' }}
      className="absolute inset-0"
    >
      <ClipVideo source={source} onPlaying={() => setReady(true)} />
    </motion.div>
  )
}
