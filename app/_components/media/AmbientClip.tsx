'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, usePresence } from 'framer-motion'

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

/** Ambient stream for a backdrop, muted by default. Direct sources start at the
    random point via a #t media fragment; HLS sources go through hls.js (same as the
    player). Tearing down stops all segment requests — Jellyfin reaps the idle
    transcode on its own, and the clip never reports playback progress. */
export function ClipVideo({ source, onPlaying, muted = true, volume = 0.6, onAutoplayBlocked }: {
  source: PreviewSource
  onPlaying?: () => void
  muted?: boolean
  /** Attenuated for ambient feel; only applies while unmuted. */
  volume?: number
  /** Unmuted play() was rejected by autoplay policy — playback fell back to muted. */
  onAutoplayBlocked?: () => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  // Ref'd so a changing callback doesn't tear down and restart the stream.
  const onPlayingRef = useRef(onPlaying)
  useEffect(() => { onPlayingRef.current = onPlaying }, [onPlaying])
  const onAutoplayBlockedRef = useRef(onAutoplayBlocked)
  useEffect(() => { onAutoplayBlockedRef.current = onAutoplayBlocked }, [onAutoplayBlocked])

  // Declared before the source effect so audio state is set before play() runs on
  // mount; kept separate so toggling mute doesn't tear down the stream.
  useEffect(() => {
    const video = ref.current
    if (video) { video.muted = muted; video.volume = volume }
  }, [muted, volume])

  useEffect(() => {
    const video = ref.current
    if (!video) return
    let hls: { destroy(): void } | undefined
    let cancelled = false
    const handlePlaying = () => onPlayingRef.current?.()
    video.addEventListener('playing', handlePlaying)
    const tryPlay = () => {
      video.play().catch(() => {
        if (video.muted) return
        video.muted = true
        onAutoplayBlockedRef.current?.()
        video.play().catch(() => {})
      })
    }
    if (source.method === 'direct') {
      video.src = `${source.url}#t=${source.startAt}`
      tryPlay()
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled || !ref.current) return
        if (Hls.isSupported()) {
          hls = new Hls({ startPosition: source.startAt })
          ;(hls as InstanceType<typeof Hls>).loadSource(source.url)
          ;(hls as InstanceType<typeof Hls>).attachMedia(video)
          tryPlay()
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = source.url
          video.currentTime = source.startAt
          tryPlay()
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

  return <video ref={ref} muted={muted} playsInline className="absolute inset-0 h-full w-full object-cover" />
}

/** Random point between 10% and 70% of the runtime — skips titles and avoids
    ending spoilers. Very short runtimes just start at the beginning. */
export function rollStartAt(runtimeSeconds: number): number {
  return runtimeSeconds > 120 ? Math.floor(runtimeSeconds * (0.1 + 0.6 * Math.random())) : 0
}

const AMBIENT_MUTE_KEY = 'reel.ambientMuted'

/** Shared mute preference for ambient clips (picker + detail views). Sound on by
    default. localStorage is read in an effect — the detail hero is server-rendered,
    so a render-time read would mismatch hydration. */
export function useAmbientMute(): { muted: boolean; toggle: () => void; forceMute: () => void } {
  const [muted, setMuted] = useState(false)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try { setMuted(window.localStorage.getItem(AMBIENT_MUTE_KEY) === '1') } catch {}
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */
  const toggle = () => setMuted(m => {
    const next = !m
    try { window.localStorage.setItem(AMBIENT_MUTE_KEY, next ? '1' : '0') } catch {}
    return next
  })
  // An autoplay-policy block is a browser decision, not a preference — never persisted.
  const forceMute = () => setMuted(true)
  return { muted, toggle, forceMute }
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
    crossfades to a new random point in the title after every rotateMs of actual
    playback. Renders nothing until a clip is playing — the static backdrop behind
    it stays visible. */
export function AmbientClip({
  itemId, startDelayMs = 1000, rotateMs = 10_000, muted = true, onAutoplayBlocked, onClipPlaying,
}: { itemId: string; startDelayMs?: number; rotateMs?: number; muted?: boolean; onAutoplayBlocked?: () => void; onClipPlaying?: () => void }) {
  const [clip, setClip] = useState<PreviewSource | null>(null)
  // undefined = not resolved yet, null = no playable source (mock mode / 404)
  const sourceRef = useRef<CachedPlayback | null | undefined>(undefined)
  const rotateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onClipPlayingRef = useRef(onClipPlaying)
  useEffect(() => { onClipPlayingRef.current = onClipPlaying }, [onClipPlaying])

  // Heavy remuxes can take seconds to load, so the rotation countdown starts when
  // the active clip actually renders frames — not when it was requested. A repeat
  // 'playing' event (rebuffer recovery) just re-arms the timer.
  const handleClipPlaying = () => {
    onClipPlayingRef.current?.()
    const src = sourceRef.current
    if (!src) return
    const runtime = src.runtimeTicks / 10_000_000
    if (runtime <= 120) return
    clearTimeout(rotateTimer.current)
    rotateTimer.current = setTimeout(() => {
      setClip(c => {
        let next = rollStartAt(runtime)
        // The AnimatePresence key includes startAt — nudge so it always changes.
        if (c && next === c.startAt) next += 30
        return { url: src.url, method: src.method, startAt: next }
      })
    }, rotateMs)
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false
    let startTimer: ReturnType<typeof setTimeout> | undefined
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
      // Rotation is armed by handleClipPlaying once this clip reports playback.
      setClip({ url: src.url, method: src.method, startAt: rollStartAt(runtime) })
    }

    function stop() {
      clearTimeout(startTimer)
      clearTimeout(rotateTimer.current)
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
      {clip && <ClipLayer key={`${clip.url}#${clip.startAt}`} source={clip} muted={muted} onAutoplayBlocked={onAutoplayBlocked} onPlaying={handleClipPlaying} />}
    </AnimatePresence>
  )
}

/** One clip in the crossfade stack. Fades in only once the video is actually
    rendering frames — fading on mount would blend in a still-black element.
    The outgoing layer keeps playing while it fades, so clip-to-clip rotations
    dissolve into each other instead of dipping through the backdrop. */
function ClipLayer({ source, muted = true, onAutoplayBlocked, onPlaying }: { source: PreviewSource; muted?: boolean; onAutoplayBlocked?: () => void; onPlaying?: () => void }) {
  const [ready, setReady] = useState(false)
  // AnimatePresence freezes an exiting child's props, so presence is read here:
  // the outgoing layer keeps its video through the fade but drops audio instantly —
  // two clips at different timestamps would double up the soundtrack.
  const [isPresent] = usePresence()
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: ready ? 1 : 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.4, ease: 'easeInOut' }}
      className="absolute inset-0"
    >
      {/* Only the live layer reports upward — an exiting layer recovering from a
          stall must not re-arm the rotation timer. */}
      <ClipVideo
        source={source}
        muted={muted || !isPresent}
        onAutoplayBlocked={onAutoplayBlocked}
        onPlaying={() => { setReady(true); if (isPresent) onPlaying?.() }}
      />
    </motion.div>
  )
}
