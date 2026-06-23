'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

interface PlaybackSource {
  itemId: string
  method: 'direct' | 'hls'
  url: string
  mediaSourceId: string
  playSessionId: string
  positionTicks: number
  runtimeTicks: number
}

type ReportKind = 'start' | 'progress' | 'stopped'

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
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const [attempt, setAttempt] = useState(0) // bump to retry; >0 forces HLS
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    let hls: { destroy: () => void } | null = null
    let source: PlaybackSource | null = null
    let progressTimer: ReturnType<typeof setInterval> | null = null
    const forceHls = attempt > 0

    setLoading(true)
    setError(null)

    function sendReport(kind: ReportKind, paused = false) {
      if (!source || !video) return
      const body = JSON.stringify({
        kind,
        report: {
          ItemId: source.itemId,
          PlaySessionId: source.playSessionId,
          MediaSourceId: source.mediaSourceId,
          PositionTicks: Math.round(video.currentTime * 1e7),
          IsPaused: paused,
        },
      })
      fetch('/api/jellyfin/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: kind === 'stopped',
      }).catch(() => {})
    }

    function onError() {
      // Containers like MKV often fail browser direct-play even when Jellyfin
      // reports it as supported — retry once over HLS (server transcode).
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

        const startAt = source.positionTicks > 0 ? source.positionTicks / 1e7 : 0
        const nativeHls = video.canPlayType('application/vnd.apple.mpegurl') !== ''

        if (source.method === 'hls' && !nativeHls) {
          const { default: Hls } = await import('hls.js')
          if (cancelled) return
          if (Hls.isSupported()) {
            const h = new Hls({ startPosition: startAt > 0 ? startAt : -1 })
            hls = h
            h.loadSource(source.url)
            h.attachMedia(video)
          } else {
            video.src = source.url
          }
        } else {
          video.src = source.url
        }

        video.addEventListener(
          'loadedmetadata',
          () => {
            if (startAt > 0 && video.currentTime < 1) {
              try {
                video.currentTime = startAt
              } catch {
                /* seek may not be ready */
              }
            }
            setLoading(false)
          },
          { once: true },
        )
        video.addEventListener('playing', () => sendReport('start'), { once: true })
        video.addEventListener('pause', () => sendReport('progress', true))
        video.addEventListener('ended', () => {
          sendReport('stopped')
          onCloseRef.current()
        })
        video.addEventListener('error', onError)

        progressTimer = setInterval(() => sendReport('progress', video.paused), 10_000)
        video.play().catch(() => {
          /* autoplay can require a user gesture; controls are shown */
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
      video.removeEventListener('error', onError)
      hls?.destroy()
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [itemId, attempt])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {title && (
        <div className="absolute top-4 left-5 z-10 text-sm text-zinc-300 font-medium max-w-[60vw] truncate">
          {title}
        </div>
      )}
      <button
        onClick={() => onCloseRef.current()}
        aria-label="Close player"
        className="absolute top-4 right-4 z-10 inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 transition-colors"
      >
        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current">
          <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
        </svg>
      </button>

      {error ? (
        <div className="text-center px-6">
          <p className="text-zinc-300">{error}</p>
          <button
            onClick={() => onCloseRef.current()}
            className="mt-4 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Close
          </button>
        </div>
      ) : (
        <video
          ref={videoRef}
          controls
          autoPlay
          playsInline
          className="max-h-full max-w-full"
        />
      )}

      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
        </div>
      )}
    </motion.div>
  )
}
