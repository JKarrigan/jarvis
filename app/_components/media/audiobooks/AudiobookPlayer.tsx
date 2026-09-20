'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AudiobookChapter, AudiobookDetail, AudiobookPlayback } from '../types'
import { chapterAt } from './format'

/**
 * The persistent audiobook player. Unlike JellyfinPlayer (a modal that unmounts
 * with its page), a book has to keep playing across navigation — so a single
 * <audio> element lives here, above PageTransition, and every audiobook surface
 * (mini player, now-playing sheet, library, detail page) drives it through
 * context. Resume position lives in Jellyfin; only the loaded book id, speed and
 * volume are kept in localStorage so a reload brings the mini player back.
 */

const STORAGE_KEY = 'reel.audiobook.v1'
const REPORT_INTERVAL_MS = 10_000
export const SPEEDS = [0.8, 1, 1.2, 1.5, 1.75, 2]
export const SLEEP_MINUTES = [15, 30, 60]

export type SleepMode =
  | { kind: 'off' }
  | { kind: 'timer'; minutes: number; endsAt: number }
  | { kind: 'chapter'; chapterIndex: number }

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface PlayerValue {
  book: AudiobookDetail | null
  status: Status
  /** Why the book can't play (mock mode, stream failure). */
  error: string | null
  playing: boolean
  rate: number
  volume: number
  sleep: SleepMode
  expanded: boolean
  playMethodLabel: string | null
  /** Load (if needed) and play a book. `chapterIndex` jumps to that chapter; `fromStart` ignores the resume point. */
  play: (id: string, opts?: { chapterIndex?: number; fromStart?: boolean }) => void
  toggle: () => void
  seek: (time: number) => void
  skip: (delta: number) => void
  goToChapter: (index: number) => void
  prevChapter: () => void
  nextChapter: () => void
  setRate: (rate: number) => void
  setVolume: (volume: number) => void
  setSleep: (mode: { kind: 'off' } | { kind: 'timer'; minutes: number } | { kind: 'chapter' }) => void
  setExpanded: (open: boolean) => void
  /** Re-fetch the loaded book's details (after an edit) without touching playback. */
  refreshBook: () => Promise<void>
  close: () => void
}

const PlayerContext = createContext<PlayerValue | null>(null)
// Separate context: `time` ticks ~4×/s and only the scrubbers need it.
const TimeContext = createContext(0)

export function useAudiobookPlayer(): PlayerValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('useAudiobookPlayer must be used inside AudiobookPlayerProvider')
  return ctx
}

export function useAudiobookTime(): number {
  return useContext(TimeContext)
}

/** Live position for a book: the player's clock when it's the loaded book, else the server's. */
export function useBookPosition(book: { id: string; position: number; finished: boolean }): number {
  const { book: loaded } = useAudiobookPlayer()
  const time = useAudiobookTime()
  return loaded?.id === book.id ? time : book.position
}

function readPrefs(): { bookId?: string; rate?: number; volume?: number } {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function writePrefs(patch: { bookId?: string | null; rate?: number; volume?: number }) {
  try {
    const next = { ...readPrefs(), ...patch }
    if (patch.bookId === null) delete next.bookId
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch { /* private mode / quota — prefs are a convenience */ }
}

export function AudiobookPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [book, setBook] = useState<AudiobookDetail | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [rate, setRateState] = useState(1)
  const [volume, setVolumeState] = useState(1)
  const [sleep, setSleepState] = useState<SleepMode>({ kind: 'off' })
  const [expanded, setExpanded] = useState(false)
  const [playMethodLabel, setPlayMethodLabel] = useState<string | null>(null)

  // Latest values for event handlers / timers that outlive a render.
  const bookRef = useRef<AudiobookDetail | null>(null)
  const sourceRef = useRef<AudiobookPlayback | null>(null)
  const sleepRef = useRef<SleepMode>(sleep)
  const startedRef = useRef(false)
  const loadTokenRef = useRef(0)
  /** Seek + autoplay to apply once the new stream's metadata is in. */
  const pendingRef = useRef<{ time: number; autoplay: boolean } | null>(null)
  useEffect(() => { bookRef.current = book }, [book])
  useEffect(() => { sleepRef.current = sleep }, [sleep])

  const report = useCallback((kind: 'start' | 'progress' | 'stopped') => {
    const audio = audioRef.current
    const src = sourceRef.current
    if (!audio || !src) return
    void fetch('/api/jellyfin/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // keepalive lets the final "stopped" survive a tab close / navigation away.
      keepalive: kind === 'stopped',
      body: JSON.stringify({
        kind,
        report: {
          ItemId: src.itemId,
          MediaSourceId: src.mediaSourceId,
          PlaySessionId: src.playSessionId,
          PositionTicks: Math.round(audio.currentTime * 1e7),
          IsPaused: audio.paused,
        },
      }),
    }).catch(() => { })
  }, [])

  const stopSession = useCallback(() => {
    if (startedRef.current) report('stopped')
    startedRef.current = false
  }, [report])

  const load = useCallback(async (id: string, opts: { chapterIndex?: number; fromStart?: boolean; autoplay: boolean }) => {
    const audio = audioRef.current
    if (!audio) return
    const token = ++loadTokenRef.current
    stopSession()
    audio.pause()
    setStatus('loading')
    setError(null)
    setSleepState({ kind: 'off' })
    try {
      const res = await fetch(`/api/jellyfin/audiobooks/${id}/play`, { cache: 'no-store' })
      if (!res.ok) throw new Error('This book is no longer in the library.')
      const data = (await res.json()) as { book: AudiobookDetail; source: AudiobookPlayback | null }
      if (token !== loadTokenRef.current) return
      const chapter = opts.chapterIndex != null ? data.book.chapters[opts.chapterIndex] : undefined
      // A finished book (or one parked in its last seconds) restarts rather than resuming at the end.
      const resume = data.book.finished || data.book.position > data.book.duration - 10 ? 0 : data.book.position
      const startAt = chapter ? chapter.start : opts.fromStart ? 0 : resume
      setBook(data.book)
      setTime(startAt)
      writePrefs({ bookId: id })
      sourceRef.current = data.source
      setPlayMethodLabel(data.source?.playMethodLabel ?? null)
      if (!data.source) {
        audio.removeAttribute('src')
        setStatus('error')
        setError('Connect a Jellyfin server to play audiobooks.')
        return
      }
      pendingRef.current = { time: startAt, autoplay: opts.autoplay }
      audio.src = data.source.url
      audio.load()
    } catch (e) {
      if (token !== loadTokenRef.current) return
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Could not load this book.')
    }
  }, [stopSession])

  const play = useCallback<PlayerValue['play']>((id, opts = {}) => {
    const audio = audioRef.current
    if (!audio) return
    if (bookRef.current?.id === id && sourceRef.current && audio.src) {
      const chapter = opts.chapterIndex != null ? bookRef.current.chapters[opts.chapterIndex] : undefined
      if (chapter) audio.currentTime = chapter.start
      else if (opts.fromStart) audio.currentTime = 0
      void audio.play().catch(() => { })
      return
    }
    void load(id, { ...opts, autoplay: true })
  }, [load])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !sourceRef.current) return
    if (audio.paused) void audio.play().catch(() => { })
    else audio.pause()
  }, [])

  const seek = useCallback((t: number) => {
    const audio = audioRef.current
    const b = bookRef.current
    if (!audio || !b) return
    const clamped = Math.min(Math.max(0, t), Math.max(0, b.duration - 1))
    audio.currentTime = clamped
    setTime(clamped)
  }, [])

  const skip = useCallback((delta: number) => {
    const audio = audioRef.current
    if (audio) seek(audio.currentTime + delta)
  }, [seek])

  const goToChapter = useCallback((index: number) => {
    const c = bookRef.current?.chapters[index]
    if (c) seek(c.start)
  }, [seek])

  const currentChapter = useCallback((): AudiobookChapter | undefined => {
    const b = bookRef.current
    const audio = audioRef.current
    return b && audio ? chapterAt(b.chapters, audio.currentTime) : undefined
  }, [])

  const prevChapter = useCallback(() => {
    const c = currentChapter()
    const audio = audioRef.current
    if (!c || !audio) return
    // Like a CD player: first press restarts the chapter, a quick second goes back one.
    goToChapter(audio.currentTime - c.start > 3 ? c.index : Math.max(0, c.index - 1))
  }, [currentChapter, goToChapter])

  const nextChapter = useCallback(() => {
    const c = currentChapter()
    if (c) goToChapter(c.index + 1)
  }, [currentChapter, goToChapter])

  const setRate = useCallback((r: number) => {
    setRateState(r)
    writePrefs({ rate: r })
    if (audioRef.current) audioRef.current.playbackRate = r
  }, [])

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v))
    setVolumeState(clamped)
    writePrefs({ volume: clamped })
    if (audioRef.current) audioRef.current.volume = clamped
  }, [])

  const setSleep = useCallback<PlayerValue['setSleep']>((mode) => {
    if (mode.kind === 'timer') setSleepState({ kind: 'timer', minutes: mode.minutes, endsAt: Date.now() + mode.minutes * 60_000 })
    else if (mode.kind === 'chapter') setSleepState({ kind: 'chapter', chapterIndex: currentChapter()?.index ?? 0 })
    else setSleepState({ kind: 'off' })
  }, [currentChapter])

  const refreshBook = useCallback(async () => {
    const id = bookRef.current?.id
    if (!id) return
    try {
      const res = await fetch(`/api/jellyfin/audiobooks/${id}/play`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { book: AudiobookDetail }
      if (bookRef.current?.id === id) setBook(data.book)
    } catch { /* keep showing what we have */ }
  }, [])

  const close = useCallback(() => {
    const audio = audioRef.current
    loadTokenRef.current++
    stopSession()
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    sourceRef.current = null
    writePrefs({ bookId: null })
    setExpanded(false)
    setBook(null)
    setStatus('idle')
    setError(null)
    setSleepState({ kind: 'off' })
  }, [stopSession])

  // Restore the last book (paused) plus speed/volume after a reload.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const prefs = readPrefs()
    if (typeof prefs.rate === 'number') setRateState(prefs.rate)
    if (typeof prefs.volume === 'number') setVolumeState(prefs.volume)
    if (prefs.bookId) void load(prefs.bookId, { autoplay: false })
  }, [load])
  /* eslint-enable react-hooks/set-state-in-effect */

  // <audio> element events.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onLoadedMetadata = () => {
      const pending = pendingRef.current
      pendingRef.current = null
      audio.playbackRate = readPrefs().rate ?? 1
      audio.volume = readPrefs().volume ?? 1
      if (pending) {
        if (pending.time > 0) audio.currentTime = pending.time
        if (pending.autoplay) void audio.play().catch(() => { })
      }
      setStatus('ready')
    }
    const onPlay = () => {
      setPlaying(true)
      report(startedRef.current ? 'progress' : 'start')
      startedRef.current = true
    }
    const onPause = () => {
      setPlaying(false)
      if (startedRef.current) report('progress')
    }
    const onTimeUpdate = () => {
      setTime(audio.currentTime)
      const s = sleepRef.current
      const b = bookRef.current
      if (s.kind === 'chapter' && b && !audio.paused) {
        const c = chapterAt(b.chapters, audio.currentTime)
        if (c && c.index > s.chapterIndex) {
          // Park on the chapter boundary so resuming starts the next chapter cleanly.
          audio.pause()
          audio.currentTime = c.start
          setSleepState({ kind: 'off' })
        }
      }
    }
    const onSeeked = () => { if (startedRef.current) report('progress') }
    const onEnded = () => {
      setPlaying(false)
      stopSession()
    }
    const onError = () => {
      if (!audio.getAttribute('src')) return
      setStatus('error')
      setError('The stream stopped responding. Try again.')
      setPlaying(false)
    }
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('seeked', onSeeked)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('seeked', onSeeked)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [report, stopSession])

  // Progress heartbeat while playing.
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => report('progress'), REPORT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [playing, report])

  // Minute-based sleep timer.
  useEffect(() => {
    if (sleep.kind !== 'timer') return
    const id = setTimeout(() => {
      audioRef.current?.pause()
      setSleepState({ kind: 'off' })
    }, Math.max(0, sleep.endsAt - Date.now()))
    return () => clearTimeout(id)
  }, [sleep])

  // Final position on tab close / leaving the media app.
  useEffect(() => {
    const onHide = () => { if (startedRef.current) report('stopped') }
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      onHide()
    }
  }, [report])

  // A movie/episode starting with sound takes over: two soundtracks is never wanted.
  // (Capture phase — media events don't bubble. Muted ambient clips are left alone.)
  useEffect(() => {
    const onAnyPlay = (e: Event) => {
      const el = e.target
      if (el instanceof HTMLVideoElement && !el.muted && el.volume > 0) audioRef.current?.pause()
    }
    document.addEventListener('play', onAnyPlay, true)
    return () => document.removeEventListener('play', onAnyPlay, true)
  }, [])

  // Lock-screen / headset / keyboard media keys.
  useEffect(() => {
    if (!book || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: book.title,
      artist: book.author ?? '',
      album: book.narrator ? `Read by ${book.narrator}` : 'Audiobook',
      artwork: book.coverUrl ? [{ src: book.coverUrl, sizes: '640x640' }] : [],
    })
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => { void audioRef.current?.play().catch(() => { }) }],
      ['pause', () => audioRef.current?.pause()],
      ['seekbackward', () => skip(-15)],
      ['seekforward', () => skip(30)],
      ['previoustrack', prevChapter],
      ['nexttrack', nextChapter],
    ]
    for (const [action, handler] of handlers) {
      try { navigator.mediaSession.setActionHandler(action, handler) } catch { /* unsupported action */ }
    }
    return () => {
      for (const [action] of handlers) {
        try { navigator.mediaSession.setActionHandler(action, null) } catch { /* unsupported action */ }
      }
      navigator.mediaSession.metadata = null
    }
  }, [book, skip, prevChapter, nextChapter])

  const value = useMemo<PlayerValue>(() => ({
    book, status, error, playing, rate, volume, sleep, expanded, playMethodLabel,
    play, toggle, seek, skip, goToChapter, prevChapter, nextChapter,
    setRate, setVolume, setSleep, setExpanded, refreshBook, close,
  }), [
    book, status, error, playing, rate, volume, sleep, expanded, playMethodLabel,
    play, toggle, seek, skip, goToChapter, prevChapter, nextChapter,
    setRate, setVolume, setSleep, refreshBook, close,
  ])

  return (
    <PlayerContext.Provider value={value}>
      <TimeContext.Provider value={time}>
        {children}
        <audio ref={audioRef} preload="metadata" className="hidden" />
      </TimeContext.Provider>
    </PlayerContext.Provider>
  )
}
