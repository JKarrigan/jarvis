'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sheet } from '@/app/_components/HueControls'
import { Slider } from '../playerUi'
import {
  Back15Icon, Forward30Icon, PlaySolidIcon, PauseIcon, PrevChapterIcon, NextChapterIcon,
  MoonIcon, ListIcon, ChevronDownIcon, ChevronUpIcon, CloseIcon, VolumeIcon, CheckIcon,
} from '../icons'
import { SPEEDS, SLEEP_MINUTES, useAudiobookPlayer, useAudiobookTime, type SleepMode } from './AudiobookPlayer'
import { Cover, ChapterList, ChapterSegments } from './parts'
import { chapterAt, clock, timeLeft } from './format'

type SheetKind = 'speed' | 'sleep' | 'chapters' | null

const GLASS = 'border border-border bg-[rgba(8,6,13,0.66)] backdrop-blur-xl backdrop-saturate-[1.25] shadow-[0_18px_44px_rgba(0,0,0,0.55)]'
const ROUND_BTN = 'grid shrink-0 place-items-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-40'

function sleepLabel(sleep: SleepMode): string {
  if (sleep.kind === 'chapter') return 'End of chapter'
  if (sleep.kind === 'timer') return `${sleep.minutes} min`
  return 'Sleep timer'
}

/** Spinner while the stream resolves, else play/pause. */
function PlayGlyph({ className }: { className: string }) {
  const { playing, status } = useAudiobookPlayer()
  if (status === 'loading') {
    return <span className={`${className} animate-spin rounded-full border-2 border-current border-t-transparent`} />
  }
  return playing ? <PauseIcon className={className} /> : <PlaySolidIcon className={className} />
}

/** Scrubs the *current chapter* — a 16-hour bar is useless for finding your place. */
function ChapterScrubber({ showTimes = true }: { showTimes?: boolean }) {
  const { book, seek } = useAudiobookPlayer()
  const time = useAudiobookTime()
  if (!book) return null
  const c = chapterAt(book.chapters, time)
  const start = c?.start ?? 0
  const len = c?.duration || book.duration || 1
  const into = Math.min(len, Math.max(0, time - start))
  const slider = (
    <Slider
      ariaLabel="Position in chapter"
      fraction={into / len}
      onChange={f => seek(start + f * len)}
    />
  )
  if (!showTimes) return slider
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3.5">
      <span className="text-[12.5px] font-semibold tabular-nums text-white/65">{clock(into)}</span>
      {slider}
      <span className="text-[12.5px] font-semibold tabular-nums text-white/65">-{clock(len - into)}</span>
    </div>
  )
}

function PlayerSheet({ kind, onClose }: { kind: Exclude<SheetKind, null>; onClose: () => void }) {
  const { book, rate, setRate, sleep, setSleep, goToChapter } = useAudiobookPlayer()
  const time = useAudiobookTime()
  const option = (label: string, active: boolean, onPick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={() => { onPick(); onClose() }}
      className={`flex h-12 w-full items-center justify-between rounded-xl px-4 text-left text-[15px] font-semibold transition-colors ${active ? 'bg-white/10 text-accent-soft' : 'text-zinc-100 hover:bg-white/5'}`}
    >
      {label}
      {active && <CheckIcon className="h-4 w-4 text-accent" />}
    </button>
  )
  return (
    <Sheet onClose={onClose} wide={kind === 'chapters'}>
      <div className="space-y-2 p-5">
        <h3 className="text-lg font-semibold text-zinc-100">
          {kind === 'speed' ? 'Playback speed' : kind === 'sleep' ? 'Sleep timer' : 'Chapters'}
        </h3>
        {kind === 'speed' && SPEEDS.map(s => option(`${s}×`, s === rate, () => setRate(s)))}
        {kind === 'sleep' && (
          <>
            {option('Off', sleep.kind === 'off', () => setSleep({ kind: 'off' }))}
            {SLEEP_MINUTES.map(m => option(`${m} minutes`, sleep.kind === 'timer' && sleep.minutes === m, () => setSleep({ kind: 'timer', minutes: m })))}
            {option('End of chapter', sleep.kind === 'chapter', () => setSleep({ kind: 'chapter' }))}
          </>
        )}
        {kind === 'chapters' && book && (
          <ChapterList
            chapters={book.chapters}
            position={time}
            started
            followCurrent
            onSelect={i => { goToChapter(i); onClose() }}
          />
        )}
      </div>
    </Sheet>
  )
}

function MiniPlayer({ onSheet }: { onSheet: (k: SheetKind) => void }) {
  const { book, status, error, rate, sleep, toggle, skip, setExpanded, close } = useAudiobookPlayer()
  const time = useAudiobookTime()
  if (!book) return null
  const chapter = chapterAt(book.chapters, time)
  const canPlay = status === 'ready' || status === 'loading'
  const subtitle = error ?? [book.chapters.length > 1 ? chapter?.title : undefined, book.author].filter(Boolean).join(' · ')
  return (
    <motion.div
      initial={{ y: 110, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 110, opacity: 0, transition: { duration: 0.22, ease: [0.32, 0, 0.67, 0] } }}
      transition={{ type: 'spring', bounce: 0.18, duration: 0.5 }}
      className={`fixed z-[44] flex items-center overflow-hidden ${GLASS}
        inset-x-2.5 bottom-[calc(76px+env(safe-area-inset-bottom))] h-[62px] gap-2 rounded-2xl pl-2 pr-1.5
        md:left-[var(--rail)] md:right-[var(--gx)] md:bottom-[18px] md:h-[78px] md:gap-6 md:rounded-[20px] md:pl-3 md:pr-4`}
    >
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={`Open player: ${book.title}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left md:w-[290px] md:flex-none"
      >
        <Cover book={book} rounded="rounded-[10px]" titleClass="" className="w-[46px] md:w-[52px] shadow-[0_6px_16px_rgba(0,0,0,0.5)]" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13.5px] font-bold text-ink md:text-[14px]">{book.title}</span>
          <span className={`truncate text-[12px] md:text-[12.5px] ${error ? 'text-[var(--pass)]' : 'text-white/65'}`}>{subtitle}</span>
        </span>
      </button>

      <div className="flex shrink-0 items-center md:gap-1.5">
        <button type="button" aria-label="Back 15 seconds" disabled={!canPlay} onClick={() => skip(-15)} className={`${ROUND_BTN} h-11 w-11 text-white/80`}>
          <Back15Icon className="h-[25px] w-[25px]" />
        </button>
        <button
          type="button"
          aria-label="Play or pause"
          disabled={!canPlay}
          onClick={toggle}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-ink-on-accent shadow-[0_8px_22px_var(--glow)] transition hover:brightness-[1.06] disabled:opacity-40 md:h-[46px] md:w-[46px]"
        >
          <PlayGlyph className="h-5 w-5" />
        </button>
        <button type="button" aria-label="Forward 30 seconds" disabled={!canPlay} onClick={() => skip(30)} className={`${ROUND_BTN} hidden h-11 w-11 text-white/80 md:grid`}>
          <Forward30Icon className="h-[25px] w-[25px]" />
        </button>
      </div>

      <div className="hidden min-w-0 flex-1 md:flex">
        <ChapterScrubber />
      </div>

      <div className="hidden shrink-0 items-center gap-0.5 md:flex">
        <button type="button" aria-label="Playback speed" onClick={() => onSheet('speed')} className="h-11 rounded-xl px-3 text-[13.5px] font-extrabold text-accent-soft transition-colors hover:bg-white/10">
          {rate}×
        </button>
        <button type="button" aria-label={sleepLabel(sleep)} title={sleepLabel(sleep)} onClick={() => onSheet('sleep')} className={`${ROUND_BTN} h-11 w-11 ${sleep.kind === 'off' ? 'text-white/80' : 'text-accent'}`}>
          <MoonIcon className="h-[21px] w-[21px]" />
        </button>
        <button type="button" aria-label="Chapters" onClick={() => onSheet('chapters')} className={`${ROUND_BTN} h-11 w-11 text-white/80`}>
          <ListIcon className="h-[21px] w-[21px]" />
        </button>
        <button type="button" aria-label="Open player" onClick={() => setExpanded(true)} className={`${ROUND_BTN} h-11 w-11 text-white/80`}>
          <ChevronUpIcon className="h-[22px] w-[22px]" />
        </button>
        <button type="button" aria-label="Close player" onClick={close} className={`${ROUND_BTN} h-11 w-11 text-white/55`}>
          <CloseIcon className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* Phone: whole-book progress hairline (the scrubber lives in the full player). */}
      <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10 md:hidden">
        <span className="block h-full bg-accent" style={{ width: `${Math.min(100, (time / (book.duration || 1)) * 100)}%` }} />
      </span>
    </motion.div>
  )
}

function NowPlaying({ onSheet, sheetOpen }: { onSheet: (k: SheetKind) => void; sheetOpen: boolean }) {
  const {
    book, status, error, rate, volume, sleep, playMethodLabel,
    toggle, skip, prevChapter, nextChapter, goToChapter, setVolume, setExpanded, close,
  } = useAudiobookPlayer()
  const time = useAudiobookTime()

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    if (sheetOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
      if (e.key === 'Escape') setExpanded(false)
      else if (e.key === ' ' || e.key.toLowerCase() === 'k') { e.preventDefault(); toggle() }
      else if (e.key === 'ArrowLeft') skip(-15)
      else if (e.key === 'ArrowRight') skip(30)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen, setExpanded, toggle, skip])

  if (!book) return null
  const chapter = chapterAt(book.chapters, time)
  const multi = book.chapters.length > 1
  const canPlay = status === 'ready' || status === 'loading'
  const pill = 'flex h-[46px] items-center gap-2 rounded-[13px] border border-border px-4 text-[13.5px] font-bold transition-colors'

  return (
    <motion.div
      role="dialog"
      aria-label={`Now playing: ${book.title}`}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%', transition: { duration: 0.3, ease: [0.32, 0, 0.67, 0] } }}
      transition={{ type: 'spring', bounce: 0.12, duration: 0.55 }}
      className="fixed inset-0 z-50 overflow-y-auto bg-[#08060d]"
      style={{ backgroundImage: `radial-gradient(70% 90% at 20% 35%, hsl(${book.hue} 46% 28% / 0.8) 0%, transparent 70%), radial-gradient(60% 70% at 90% 0%, hsl(${book.hue + 28} 40% 22% / 0.5) 0%, transparent 70%), var(--bg-gradient)` }}
    >
      <div className="flex items-center justify-between px-5 pt-5 md:px-10 md:pt-8">
        <button type="button" aria-label="Collapse player" onClick={() => setExpanded(false)} className="grid h-11 w-11 place-items-center rounded-full border border-border bg-black/40 backdrop-blur-lg transition-colors hover:bg-white/10 md:h-12 md:w-12">
          <ChevronDownIcon className="h-[22px] w-[22px]" />
        </button>
        {playMethodLabel && <span className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-white/50">{playMethodLabel}</span>}
        <div className="flex items-center gap-2.5">
          {multi && (
            <button type="button" aria-label="Chapters" onClick={() => onSheet('chapters')} className="grid h-11 w-11 place-items-center rounded-full border border-border bg-black/40 backdrop-blur-lg transition-colors hover:bg-white/10 md:h-12 md:w-12 lg:hidden">
              <ListIcon className="h-[21px] w-[21px]" />
            </button>
          )}
          <button type="button" aria-label="Stop and close player" title="Stop and close player" onClick={close} className="grid h-11 w-11 place-items-center rounded-full border border-border bg-black/40 text-white/70 backdrop-blur-lg transition-colors hover:bg-white/10 md:h-12 md:w-12">
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1400px] items-center gap-7 px-6 pb-10 pt-5 md:min-h-[calc(100svh-140px)] md:grid-cols-[minmax(240px,430px)_minmax(0,1fr)] md:gap-14 md:px-16 lg:grid-cols-[minmax(240px,430px)_minmax(0,1fr)_330px]">
        <Cover book={book} rounded="rounded-[20px] md:rounded-[22px]" titleClass="text-[clamp(28px,4vw,50px)]" className="mx-auto w-[min(78vw,340px)] shadow-[0_30px_90px_rgba(0,0,0,0.6)] md:w-full" />

        <div className="flex min-w-0 flex-col gap-6 md:gap-7">
          <div className="flex flex-col gap-2">
            {multi && chapter && (
              <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-accent-soft">
                {/* "Track 20" already carries its number — don't print "Track 20 · 20 of 38". */}
                {new RegExp(`\\b${chapter.index + 1}$`).test(chapter.title)
                  ? `${chapter.title} of ${book.chapters.length}`
                  : `${chapter.title} · ${chapter.index + 1} of ${book.chapters.length}`}
              </div>
            )}
            <h1 className="text-[clamp(25px,3.6vw,46px)] font-[800] leading-[1.04] tracking-[-0.028em] text-ink">{book.title}</h1>
            <div className="text-[14px] text-white/65 md:text-[16px]">
              {[book.author, book.narrator && `read by ${book.narrator}`].filter(Boolean).join(' · ')}
            </div>
            {error && <div className="text-[13.5px] font-semibold text-[var(--pass)]">{error}</div>}
          </div>

          <div className="flex flex-col gap-2">
            <ChapterScrubber showTimes={false} />
            <div className="flex justify-between text-[13px] font-bold tabular-nums text-white/80">
              <span>{clock(time - (chapter?.start ?? 0))}</span>
              <span>-{clock((chapter?.start ?? 0) + (chapter?.duration ?? book.duration) - time)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between md:justify-center md:gap-5">
            <button type="button" aria-label="Previous chapter" disabled={!canPlay} onClick={prevChapter} className={`${ROUND_BTN} h-12 w-12 text-white/80 md:h-[52px] md:w-[52px]`}>
              <PrevChapterIcon className="h-6 w-6" />
            </button>
            <button type="button" aria-label="Back 15 seconds" disabled={!canPlay} onClick={() => skip(-15)} className={`${ROUND_BTN} h-14 w-14 md:h-[60px] md:w-[60px]`}>
              <Back15Icon className="h-8 w-8 md:h-[34px] md:w-[34px]" />
            </button>
            <button
              type="button"
              aria-label="Play or pause"
              disabled={!canPlay}
              onClick={toggle}
              className="grid h-[78px] w-[78px] shrink-0 place-items-center rounded-full bg-accent text-ink-on-accent shadow-[0_12px_34px_var(--glow)] transition hover:brightness-[1.06] disabled:opacity-40 md:h-[86px] md:w-[86px]"
            >
              <PlayGlyph className="h-8 w-8" />
            </button>
            <button type="button" aria-label="Forward 30 seconds" disabled={!canPlay} onClick={() => skip(30)} className={`${ROUND_BTN} h-14 w-14 md:h-[60px] md:w-[60px]`}>
              <Forward30Icon className="h-8 w-8 md:h-[34px] md:w-[34px]" />
            </button>
            <button type="button" aria-label="Next chapter" disabled={!canPlay} onClick={nextChapter} className={`${ROUND_BTN} h-12 w-12 text-white/80 md:h-[52px] md:w-[52px]`}>
              <NextChapterIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <ChapterSegments chapters={book.chapters} position={time} onSeek={multi ? goToChapter : undefined} />
            <div className="flex justify-between text-[12.5px] text-white/50">
              <span>Whole book</span>
              <span className="font-bold text-accent-soft">{timeLeft(book.duration - time)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => onSheet('speed')} className={`${pill} bg-surface text-white/80 hover:bg-white/10`}>{rate}× speed</button>
            <button type="button" onClick={() => onSheet('sleep')} className={`${pill} ${sleep.kind === 'off' ? 'bg-surface text-white/80 hover:bg-white/10' : 'bg-surface-2 text-accent-soft'}`}>
              <MoonIcon className="h-[18px] w-[18px]" />{sleepLabel(sleep)}
            </button>
            <div className="hidden flex-1 md:block" />
            <div className="hidden w-[130px] shrink-0 items-center gap-2.5 text-white/80 md:flex">
              <VolumeIcon className="h-5 w-5 shrink-0" />
              <Slider ariaLabel="Volume" fraction={volume} onChange={setVolume} />
            </div>
          </div>
        </div>

        {multi && (
          <section className="hidden flex-col gap-3.5 lg:flex">
            <h2 className="text-[20px] font-bold tracking-[-0.01em] text-ink">Chapters</h2>
            <div className="scrollbar-hide max-h-[min(62vh,560px)] overflow-y-auto rounded-[18px] border border-border bg-black/40 p-2 backdrop-blur-xl">
              <ChapterList chapters={book.chapters} position={time} started followCurrent rowClass="h-[50px] px-2.5" onSelect={goToChapter} />
            </div>
          </section>
        )}
      </div>
    </motion.div>
  )
}

/** Mini player + full now-playing sheet + their option sheets. Mounted once in MediaShell. */
export function AudiobookPlayerChrome() {
  const { book, expanded } = useAudiobookPlayer()
  const [sheet, setSheet] = useState<SheetKind>(null)
  return (
    <>
      <AnimatePresence>{book && !expanded && <MiniPlayer key="mini" onSheet={setSheet} />}</AnimatePresence>
      <AnimatePresence>{book && expanded && <NowPlaying key="full" onSheet={setSheet} sheetOpen={sheet != null} />}</AnimatePresence>
      <AnimatePresence>{sheet && <PlayerSheet key={sheet} kind={sheet} onClose={() => setSheet(null)} />}</AnimatePresence>
    </>
  )
}
