'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatTime, IconPause, IconPlay, Slider } from '../playerUi'
import { fileUrl, streamUrl, thumbUrl, type PhotoItem } from './api'

function nativeCanPlay(mime: string): boolean {
  if (!mime) return false
  return document.createElement('video').canPlayType(mime) !== ''
}

/**
 * A video in the lightbox. Plays the original natively when the browser says it can
 * (`canPlayType`), else — or when playback errors / decodes no picture (HEVC in Chrome) —
 * falls back to the server's H.264 720p transcode (`/stream`). The transcode is a live
 * fragmented MP4 that can't be seeked natively, so in that mode the controls are our own
 * and seeking reloads the stream from `?t=` (offset added back onto the clock).
 */
export function VideoView({ item, registerVideo }: { item: PhotoItem; registerVideo: (el: HTMLVideoElement | null) => void }) {
  const [mode, setMode] = useState<'file' | 'stream'>(() => (nativeCanPlay(item.mime) ? 'file' : 'stream'))
  const poster = thumbUrl(item, 'p')

  if (mode === 'file') {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <video
          ref={registerVideo}
          src={fileUrl(item.id)}
          poster={poster}
          controls
          playsInline
          autoPlay
          preload="metadata"
          onError={() => setMode('stream')}
          onLoadedMetadata={e => {
            // Audio-only decode of an unsupported video codec: no picture → transcode instead.
            const v = e.currentTarget
            if (v.videoWidth === 0 && (item.width ?? 0) > 0) setMode('stream')
          }}
          className="max-h-full max-w-full bg-black"
          aria-label="Video"
        />
      </div>
    )
  }
  return <StreamPlayer item={item} poster={poster} registerVideo={registerVideo} />
}

function StreamPlayer({ item, poster, registerVideo }: { item: PhotoItem; poster: string; registerVideo: (el: HTMLVideoElement | null) => void }) {
  const duration = item.duration ?? 0
  const [offset, setOffset] = useState(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(true)
  const [failed, setFailed] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const setRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
    registerVideo(el)
  }, [registerVideo])

  // The src is managed here rather than as a prop so that leaving (unmount, or a seek that
  // swaps the offset) drops the connection at once and the server kills that ffmpeg instead
  // of waiting for a socket timeout. Re-applied on setup, which also survives StrictMode's
  // mount → cleanup → mount cycle.
  const src = streamUrl(item.id, offset)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.setAttribute('src', src)
    v.load()
    void v.play().catch(() => {})
    return () => { v.pause(); v.removeAttribute('src'); v.load() }
  }, [src, attempt])

  // Reload the stream from a new offset (the transcode restarts there).
  const seekTo = (sec: number) => {
    const t = Math.max(0, Math.min(sec, Math.max(0, duration - 0.5)))
    setOffset(t)
    setTime(0)
    setWaiting(true)
    setFailed(false)
  }

  const toggle = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play().catch(() => {})
    else v.pause()
  }

  const now = offset + time
  const fraction = scrub ?? (duration > 0 ? now / duration : 0)

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <video
        ref={setRef}
        poster={offset === 0 ? poster : undefined}
        playsInline
        autoPlay
        onClick={toggle}
        onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
        onPlaying={() => { setPlaying(true); setWaiting(false) }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setWaiting(true)}
        onEnded={() => setPlaying(false)}
        onError={() => { setFailed(true); setWaiting(false) }}
        className="max-h-full max-w-full bg-black"
        aria-label="Video (converted for this browser)"
      />
      {waiting && !failed && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-black/55 px-5 py-4 text-[13px] text-white/80 backdrop-blur">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            Converting for this browser…
          </div>
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex max-w-[300px] flex-col items-center gap-3 rounded-2xl bg-black/65 px-5 py-4 text-center text-[13.5px] text-white/80 backdrop-blur">
            This video can&apos;t be played right now (the server may be busy or the library offline).
            <button
              type="button"
              onClick={() => { setFailed(false); setWaiting(true); setAttempt(n => n + 1) }}
              className="rounded-[10px] bg-white/10 px-3 py-1.5 font-semibold text-white hover:bg-white/20"
            >
              Try again
            </button>
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 bg-gradient-to-t from-black/75 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-10">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white hover:bg-white/15"
        >
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <span className="w-[92px] shrink-0 text-[12px] tabular-nums text-white/80">
          {formatTime(scrub != null ? scrub * duration : now)} / {formatTime(duration)}
        </span>
        <div className="min-w-0 flex-1">
          <Slider
            ariaLabel="Seek"
            fraction={fraction}
            onChange={f => setScrub(f)}
            onChangeEnd={() => {
              if (scrub != null && duration > 0) seekTo(scrub * duration)
              setScrub(null)
            }}
          />
        </div>
      </div>
    </div>
  )
}
