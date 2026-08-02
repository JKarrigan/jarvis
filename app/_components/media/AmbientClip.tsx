'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
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
      video.play().catch((err: unknown) => {
        // Only a NotAllowedError is an autoplay block. Teardown mid-load (voting to
        // the next card, navigating away) rejects with AbortError — falling back on
        // that would force-mute the shared preference for no reason.
        if (video.muted || (err as DOMException)?.name !== 'NotAllowedError') return
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

// Application-wide mute state, shared live across every mounted consumer — two hook
// instances can be on screen at once (e.g. the picker and its embedded detail view),
// and a localStorage-on-mount read would let the stale one win on the next clip.
let ambientMuted = false
let ambientMuteLoaded = false
const muteListeners = new Set<() => void>()

function loadAmbientMuted() {
  if (ambientMuteLoaded) return
  ambientMuteLoaded = true
  try { ambientMuted = window.localStorage.getItem(AMBIENT_MUTE_KEY) === '1' } catch {}
}

function setAmbientMuted(next: boolean, persist: boolean) {
  ambientMuted = next
  if (persist) { try { window.localStorage.setItem(AMBIENT_MUTE_KEY, next ? '1' : '0') } catch {} }
  muteListeners.forEach(l => l())
}

function subscribeMute(cb: () => void) {
  // Stored preference loads on first subscribe (never during SSR); React re-reads the
  // snapshot right after subscribing, so a loaded value still reaches the first render.
  loadAmbientMuted()
  muteListeners.add(cb)
  return () => { muteListeners.delete(cb) }
}

/** Shared mute preference for ambient clips (picker + detail views). Sound on by default. */
export function useAmbientMute(): { muted: boolean; toggle: () => void; forceMute: () => void } {
  const muted = useSyncExternalStore(subscribeMute, () => ambientMuted, () => false)
  return {
    muted,
    toggle: () => setAmbientMuted(!ambientMuted, true),
    // An autoplay-policy block is a browser decision, not a preference — never persisted.
    forceMute: () => setAmbientMuted(true, false),
  }
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
    resolving a stream (so rapid item changes make zero network calls), then rotates
    to a new random point in the title after every rotateMs of actual playback. The
    incoming clip preloads hidden on top of the current one and only takes over once
    it is rendering frames, so rotations dissolve clip-into-clip without dipping
    through the static backdrop. Renders nothing until the first clip is playing. */
export function AmbientClip({
  itemId, startDelayMs = 1000, rotateMs = 13_000, muted = true, onAutoplayBlocked, onClipPlaying,
}: { itemId: string; startDelayMs?: number; rotateMs?: number; muted?: boolean; onAutoplayBlocked?: () => void; onClipPlaying?: () => void }) {
  // Up to two layers: [current] or [current, incoming]. State and ref move together —
  // timer callbacks and 'playing' handlers need the latest value synchronously.
  const [clips, setClips] = useState<PreviewSource[]>([])
  const clipsRef = useRef<PreviewSource[]>([])
  const apply = (next: PreviewSource[]) => { clipsRef.current = next; setClips(next) }
  // The outgoing layer during a swap: silenced but still rendered under the fade.
  const [retiringKey, setRetiringKey] = useState<string | null>(null)
  // undefined = not resolved yet, null = no playable source (mock mode / 404)
  const sourceRef = useRef<CachedPlayback | null | undefined>(undefined)
  const rotateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const swapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onClipPlayingRef = useRef(onClipPlaying)
  useEffect(() => { onClipPlayingRef.current = onClipPlaying }, [onClipPlaying])

  const clipKey = (c: PreviewSource) => `${c.url}#${c.startAt}`

  // Heavy remuxes can take seconds to load, so both the layer swap and the rotation
  // countdown key off the incoming clip actually rendering frames — not off when it
  // was requested. Only the newest layer drives either: an older layer recovering
  // from a rebuffer must not tear down a still-loading incoming clip. A repeat
  // 'playing' event from the newest layer just re-arms the timer.
  const handleClipPlaying = (key: string) => {
    const cur = clipsRef.current
    const last = cur[cur.length - 1]
    if (!last || clipKey(last) !== key) return
    onClipPlayingRef.current?.()
    if (cur.length > 1) {
      // The incoming layer is rendering on top: silence the outgoing layer now
      // (keeping it audible would double the soundtrack) but leave it fully visible
      // beneath the fade — dropping it mid-fade would dip through the backdrop.
      setRetiringKey(clipKey(cur[0]))
      clearTimeout(swapTimer.current)
      swapTimer.current = setTimeout(() => {
        const latest = clipsRef.current
        const tail = latest[latest.length - 1]
        if (latest.length > 1 && tail && clipKey(tail) === key) { apply([tail]); setRetiringKey(null) }
      }, 1600) // just past the 1.4s fade-in, when the incoming layer fully covers it
    }
    const src = sourceRef.current
    if (!src) return
    const runtime = src.runtimeTicks / 10_000_000
    if (runtime <= 120) return
    clearTimeout(rotateTimer.current)
    rotateTimer.current = setTimeout(() => {
      const prev = clipsRef.current[clipsRef.current.length - 1]
      let next = rollStartAt(runtime)
      // Layer keys include startAt — nudge so it always changes.
      if (prev && next === prev.startAt) next += 30
      // Mount the incoming clip hidden above the current one; handleClipPlaying
      // swaps the layers once it reports playback.
      apply([...clipsRef.current.slice(-1), { url: src.url, method: src.method, startAt: next }])
    }, rotateMs)
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false
    let startTimer: ReturnType<typeof setTimeout> | undefined
    apply([])
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
      apply([{ url: src.url, method: src.method, startAt: rollStartAt(runtime) }])
    }

    function stop() {
      clearTimeout(startTimer)
      clearTimeout(rotateTimer.current)
      clearTimeout(swapTimer.current)
      apply([])
      setRetiringKey(null)
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
      {clips.map(c => (
        <ClipLayer key={clipKey(c)} source={c} muted={muted || clipKey(c) === retiringKey} onAutoplayBlocked={onAutoplayBlocked} onPlaying={() => handleClipPlaying(clipKey(c))} />
      ))}
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
