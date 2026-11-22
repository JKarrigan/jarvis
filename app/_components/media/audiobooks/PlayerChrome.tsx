'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sheet } from '../Sheet'
import { useDialog, useHotkeys } from '../hooks'
import { Slider } from '../playerUi'
import {
  Back15Icon, Forward30Icon, PlaySolidIcon, PauseIcon, PrevChapterIcon, NextChapterIcon,
  MoonIcon, ListIcon, ChevronDownIcon, ChevronUpIcon, CloseIcon, VolumeIcon, CheckIcon,
} from '../icons'
import { MIN_RATE, MAX_RATE, RATE_STEP, RATE_PRESETS, SLEEP_MINUTES, useAudiobookPlayer, useAudiobookTime, type SleepMode } from './AudiobookPlayer'
import { Cover, ChapterList, ChapterSegments } from './parts'
import { chapterAt, clock, length, timeLeft } from './format'

type SheetKind = 'speed' | 'sleep' | 'chapters' | null

const GLASS = 'border border-border bg-[rgba(8,6,13,0.66)] backdrop-blur-xl backdrop-saturate-[1.25] shadow-[0_18px_44px_rgba(0,0,0,0.55)]'
const ROUND_BTN = 'grid shrink-0 place-items-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-40'

function sleepLabel(sleep: SleepMode): string {
  if (sleep.kind === 'chapter') return 'End of chapter'
  if (sleep.kind === 'timer') return `${sleep.minutes} min`
  return 'Sleep timer'
}

/** Spinner while the stream resolves, a retry arrow after an error, else play/pause. */
function PlayGlyph({ className }: { className: string }) {
  const { playing, status } = useAudiobookPlayer()
  if (status === 'loading') {
    return <span className={`${className} animate-spin rounded-full border-2 border-current border-t-transparent`} />
  }
  if (status === 'error') {
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d="M16 10a6 6 0 1 1-1.76-4.24" /><path d="M16 3.5V6.5h-3" />
      </svg>
    )
  }
  return playing ? <PauseIcon className={className} /> : <PlaySolidIcon className={className} />
}

/** The big round button: play/pause, or Retry once the stream has failed. */
function usePlayButton() {
  const { status, toggle, retry } = useAudiobookPlayer()
  const failed = status === 'error'
  return {
    label: failed ? 'Retry' : 'Play or pause',
    onClick: failed ? retry : toggle,
    disabled: status === 'idle',
  }
}

/** Scrubs the *current chapter* — a 16-hour bar is useless for finding your place. */
function ChapterScrubber({ showTimes = true }: { showTimes?: boolean }) {
  const { book, seek } = useAudiobookPlayer()
  const time = useAudiobookTime()
  // While dragging, preview the position; seek once on release.
  const [drag, setDrag] = useState<number | null>(null)
  if (!book) return null
  const c = chapterAt(book.chapters, time)
  const start = c?.start ?? 0
  const len = c?.duration || book.duration || 1
  const into = drag != null ? drag * len : Math.min(len, Math.max(0, time - start))
  const slider = (
    <Slider
      ariaLabel="Position in chapter"
      ariaValueText={`${clock(into)} of ${clock(len)}`}
      fraction={into / len}
      onChange={setDrag}
      onChangeEnd={f => { seek(start + f * len); setDrag(null) }}
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

/** Stepper + slider over 0.5–2.5× in 0.05 steps; stays open so the speed can be nudged while listening. */
function SpeedControls({ rate, setRate }: { rate: number; setRate: (r: number) => void }) {
  const step = (dir: 1 | -1) => setRate(rate + dir * RATE_STEP)
  const stepBtn = 'grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/5 text-2xl font-semibold text-zinc-100 transition-colors hover:bg-white/10 disabled:opacity-30'
  return (
    <div className="space-y-5 pt-2">
      <div className="flex items-center justify-between gap-4">
        <button type="button" aria-label="Slower" disabled={rate <= MIN_RATE} onClick={() => step(-1)} className={stepBtn}>−</button>
        <span className="text-4xl font-extrabold tabular-nums text-accent-soft">{rate.toFixed(2)}×</span>
        <button type="button" aria-label="Faster" disabled={rate >= MAX_RATE} onClick={() => step(1)} className={stepBtn}>+</button>
      </div>
      <div className="space-y-1.5">
        <Slider
          ariaLabel="Playback speed"
          fraction={(rate - MIN_RATE) / (MAX_RATE - MIN_RATE)}
          onChange={f => setRate(MIN_RATE + f * (MAX_RATE - MIN_RATE))}
        />
        <div className="flex justify-between text-[12px] font-semibold tabular-nums text-white/50">
          <span>{MIN_RATE}×</span>
          <span>{MAX_RATE}×</span>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {RATE_PRESETS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setRate(p)}
            className={`h-10 rounded-xl text-[13.5px] font-bold tabular-nums transition-colors ${p === rate ? 'bg-white/10 text-accent-soft' : 'text-zinc-200 hover:bg-white/5'}`}
          >
            {p}×
          </button>
        ))}
      </div>
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
    <Sheet onClose={onClose} wide={kind === 'chapters'} label={kind === 'speed' ? 'Playback speed' : kind === 'sleep' ? 'Sleep timer' : 'Chapters'}>
      <div className="space-y-2 p-5">
        <h3 className="text-lg font-semibold text-zinc-100">
          {kind === 'speed' ? 'Playback speed' : kind === 'sleep' ? 'Sleep timer' : 'Chapters'}
        </h3>
        {kind === 'speed' && <SpeedControls rate={rate} setRate={setRate} />}
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
            rate={rate}
            started
            followCurrent
            onSelect={i => { goToChapter(i); onClose() }}
          />
        )}
      </div>
    </Sheet>
  )
}

/** − [speed] + : nudges by 0.05× in place; tapping the speed itself opens the full speed sheet. */
function SpeedStepper({ onOpen, className, stepClass, labelClass, label }: {
  onOpen: () => void
  className: string
  stepClass: string
  /** Fixed width (or flex-1) so the − / + buttons don't shift as the value changes. */
  labelClass: string
  label: (rate: number) => React.ReactNode
}) {
  const { rate, setRate } = useAudiobookPlayer()
  return (
    <div className={`flex shrink-0 items-center ${className}`}>
      <button type="button" aria-label="Slower" disabled={rate <= MIN_RATE} onClick={() => setRate(rate - RATE_STEP)} className={`${stepClass} grid place-items-center font-bold transition-colors hover:bg-white/10 disabled:opacity-30`}>−</button>
      <button type="button" aria-label="Playback speed" onClick={onOpen} className={`h-full shrink-0 rounded-lg text-center tabular-nums transition-colors hover:bg-white/10 ${labelClass}`}>{label(rate)}</button>
      <button type="button" aria-label="Faster" disabled={rate >= MAX_RATE} onClick={() => setRate(rate + RATE_STEP)} className={`${stepClass} grid place-items-center font-bold transition-colors hover:bg-white/10 disabled:opacity-30`}>+</button>
    </div>
  )
}

function MiniPlayer({ onSheet }: { onSheet: (k: SheetKind) => void }) {
  const { book, status, error, sleep, skip, setExpanded, close } = useAudiobookPlayer()
  const time = useAudiobookTime()
  const playBtn = usePlayButton()
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
          aria-label={playBtn.label}
          disabled={playBtn.disabled}
          onClick={playBtn.onClick}
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
        <SpeedStepper
          onOpen={() => onSheet('speed')}
          label={r => `${r.toFixed(2)}×`}
          labelClass="w-[4.25rem]"
          className="h-11 text-[13.5px] font-extrabold text-accent-soft"
          stepClass="h-9 w-8 rounded-lg text-[17px]"
        />
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
  const playBtn = usePlayButton()
  const rootRef = useRef<HTMLDivElement>(null)
  // A real modal: focus moves in and is trapped, Escape collapses it, focus returns on
  // close. Paused while an option sheet (itself a dialog) is open on top.
  useDialog(rootRef, () => setExpanded(false), { enabled: !sheetOpen })

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useHotkeys((e) => {
    // Space on a focused button already activates it — don't toggle twice.
    if (e.key === ' ' && e.target instanceof HTMLButtonElement) return
    if (e.key === ' ' || e.key.toLowerCase() === 'k') { e.preventDefault(); toggle() }
    else if (e.key === 'ArrowLeft') skip(-15)
    else if (e.key === 'ArrowRight') skip(30)
  }, { enabled: !sheetOpen, scope: rootRef })

  if (!book) return null
  const chapter = chapterAt(book.chapters, time)
  const multi = book.chapters.length > 1
  const canPlay = status === 'ready' || status === 'loading'
  const bookPercent = book.duration > 0 ? Math.min(100, Math.max(0, Math.round((time / book.duration) * 100))) : 0
  // `pillBase` has no display, gap or padding of its own, so a pill can also be
  // `hidden md:flex`, and the two phone pills can be tighter on a 320px screen.
  const pillBase = 'h-[46px] items-center whitespace-nowrap rounded-[13px] border border-border text-[13.5px] font-bold transition-colors'

  // Shared horizontal gutter so the header, stage and timeline line up edge to edge.
  const gutter = 'px-5 md:px-[clamp(28px,4.2vw,84px)]'
  const glassBtn = 'grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-black/35 backdrop-blur-xl transition-colors hover:bg-white/10 md:h-12 md:w-12'

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Now playing: ${book.title}`}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%', transition: { duration: 0.3, ease: [0.32, 0, 0.67, 0] } }}
      transition={{ type: 'spring', bounce: 0.12, duration: 0.55 }}
      className="fixed inset-0 z-50 overflow-y-auto bg-[#08060d]"
    >
      {/* Backdrop: the book's own cover, blown up and defocused, so the whole screen takes
          on its colours; books without art fall back to their hue gradient. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        {book.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.coverUrl} alt="" className="absolute inset-0 h-full w-full scale-[1.4] object-cover opacity-80 blur-[90px] saturate-[1.4]" />
        ) : (
          <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(70% 90% at 20% 35%, hsl(${book.hue} 46% 28% / 0.8) 0%, transparent 70%), radial-gradient(60% 70% at 90% 0%, hsl(${book.hue + 28} 40% 22% / 0.5) 0%, transparent 70%), var(--bg-gradient)` }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,6,13,0.55) 0%, rgba(8,6,13,0.3) 40%, rgba(8,6,13,0.82) 100%)' }} />
      </div>

      {/* A definite height (not min-height) on every size: the cover's slot below is a size
          container, and its `cqh` only resolves when the height chain above it is definite. */}
      <div className="relative flex h-full flex-col md:min-h-[600px]">
        <header className={`flex shrink-0 items-center justify-between pt-[max(20px,env(safe-area-inset-top))] md:pt-[max(28px,env(safe-area-inset-top))] ${gutter}`}>
          <button type="button" aria-label="Collapse player" onClick={() => setExpanded(false)} className={glassBtn}>
            <ChevronDownIcon className="h-[22px] w-[22px]" />
          </button>
          {playMethodLabel && <span className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-white/55">{playMethodLabel}</span>}
          <div className="flex items-center gap-2.5">
            {multi && (
              <button type="button" aria-label="Chapters" onClick={() => onSheet('chapters')} className={`${glassBtn} xl:hidden`}>
                <ListIcon className="h-[21px] w-[21px]" />
              </button>
            )}
            <button type="button" aria-label="Stop and close player" title="Stop and close player" onClick={close} className={`${glassBtn} text-white/70`}>
              <CloseIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        {/* Stage: cover, controls, and a chapter rail that runs the full height.
            Phones stack them, and the cover takes whatever height the controls leave: its
            slot is a size container, so the square is cut to fit and the screen never has
            to scroll (toolbars showing, small phones, a title on two lines); a slot too
            short for a cover worth showing stays empty. From md the slot dissolves
            (`contents`) and the cover is sized off the viewport instead. */}
        <main className={`flex min-h-0 flex-1 flex-col gap-[clamp(10px,2dvh,20px)] py-[clamp(8px,1.6dvh,16px)] md:grid md:grid-cols-[auto_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:items-center md:gap-[clamp(28px,3.2vw,72px)] md:py-[clamp(16px,3vh,40px)] xl:grid-cols-[auto_minmax(0,1fr)_clamp(280px,22vw,400px)] ${gutter}`}>
          <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size] md:contents">
            <Cover
              book={book}
              rounded="rounded-[20px] md:rounded-[26px]"
              titleClass="text-[clamp(13px,12cqmin,36px)] md:text-[clamp(28px,4vw,56px)]"
              className="w-[min(100cqw,100cqh,340px)] rounded-[20px] [@container_(max-height:87px)]:hidden shadow-[0_40px_120px_rgba(0,0,0,0.65)] md:w-[min(38vw,60vh)] md:rounded-[26px] xl:w-[min(30vw,62vh)]"
            />
          </div>

          {/* One column, one width: the scrubber, transport and option rows share both edges.
              Centred on phones, left-aligned beside the cover from md. */}
          <div className="mx-auto flex w-full min-w-0 max-w-[560px] shrink-0 flex-col gap-[clamp(12px,2.6dvh,26px)] md:mx-0 md:shrink md:gap-[clamp(18px,3.2vh,40px)]">
            <div className="flex flex-col items-center gap-1.5 text-center md:items-start md:gap-2.5 md:text-left">
              {multi && chapter && (
                <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-accent-soft md:text-[12.5px]">
                  {/* "Track 20" already carries its number — don't print "Track 20 · 20 of 38". */}
                  {new RegExp(`\\b${chapter.index + 1}$`).test(chapter.title)
                    ? `${chapter.title} of ${book.chapters.length}`
                    : `${chapter.title} · ${chapter.index + 1} of ${book.chapters.length}`}
                </div>
              )}
              <h1 className="line-clamp-2 pb-[0.08em] text-[clamp(24px,2.6vw+1.6vh,62px)] font-[800] leading-[1.02] tracking-[-0.03em] text-ink [text-wrap:balance] md:line-clamp-none">{book.title}</h1>
              <div className="text-[14px] text-white/70 md:text-[clamp(15px,1.1vw,19px)]">
                {[book.author, book.narrator && `read by ${book.narrator}`].filter(Boolean).join(' · ')}
              </div>
              {error && <div className="text-[13.5px] font-semibold text-[var(--pass)]">{error}</div>}
            </div>

            <div className="flex flex-col gap-2">
              <ChapterScrubber showTimes={false} />
              <div className="flex items-baseline justify-between text-[13px] font-bold tabular-nums text-white/80 md:text-[14px]">
                <span>{clock(time - (chapter?.start ?? 0))}</span>
                {multi && <span className="font-medium text-white/60">This chapter</span>}
                <span>-{clock((chapter?.start ?? 0) + (chapter?.duration ?? book.duration) - time)}</span>
              </div>
              {/* Phones: the whole book sits directly under the chapter it belongs to.
                  From md it is the numbered bar along the bottom edge instead. */}
              <div className="mt-2 flex flex-col gap-2 md:hidden">
                <ChapterSegments chapters={book.chapters} position={time} className="h-1.5" onSeek={multi ? goToChapter : undefined} />
                <div className="flex items-baseline justify-between text-[13px] text-white/60">
                  <span>Whole book · {bookPercent}%</span>
                  <span className="font-bold text-accent-soft">{timeLeft(book.duration - time, rate)}</span>
                </div>
              </div>
            </div>

            <div className="flex w-full items-center justify-between">
              <button type="button" aria-label="Previous chapter" disabled={!canPlay} onClick={prevChapter} className={`${ROUND_BTN} h-12 w-12 text-white/80 md:h-14 md:w-14`}>
                <PrevChapterIcon className="h-6 w-6 md:h-7 md:w-7" />
              </button>
              <button type="button" aria-label="Back 15 seconds" disabled={!canPlay} onClick={() => skip(-15)} className={`${ROUND_BTN} h-14 w-14 md:h-16 md:w-16`}>
                <Back15Icon className="h-8 w-8 md:h-9 md:w-9" />
              </button>
              <button
                type="button"
                data-autofocus
                aria-label={playBtn.label}
                disabled={playBtn.disabled}
                onClick={playBtn.onClick}
                className="grid h-[78px] w-[78px] shrink-0 place-items-center rounded-full bg-accent text-ink-on-accent shadow-[0_14px_44px_var(--glow)] transition hover:scale-[1.03] hover:brightness-[1.06] disabled:opacity-40 md:h-[96px] md:w-[96px]"
              >
                <PlayGlyph className="h-8 w-8 md:h-10 md:w-10" />
              </button>
              <button type="button" aria-label="Forward 30 seconds" disabled={!canPlay} onClick={() => skip(30)} className={`${ROUND_BTN} h-14 w-14 md:h-16 md:w-16`}>
                <Forward30Icon className="h-8 w-8 md:h-9 md:w-9" />
              </button>
              <button type="button" aria-label="Next chapter" disabled={!canPlay} onClick={nextChapter} className={`${ROUND_BTN} h-12 w-12 text-white/80 md:h-14 md:w-14`}>
                <NextChapterIcon className="h-6 w-6 md:h-7 md:w-7" />
              </button>
            </div>

            <div className="flex w-full items-stretch gap-2.5">
              <SpeedStepper
                onOpen={() => onSheet('speed')}
                label={r => <>{r.toFixed(2)}×<span className="hidden sm:inline"> speed</span></>}
                labelClass="min-w-0 flex-1"
                className={`${pillBase} flex-1 gap-1 bg-black/30 px-1.5 py-1 text-white/85 backdrop-blur-xl md:gap-2 md:px-4`}
                stepClass="h-full w-10 rounded-[10px] text-[18px]"
              />
              <button type="button" onClick={() => onSheet('sleep')} className={`${pillBase} flex min-w-0 flex-1 justify-center gap-2 px-3 backdrop-blur-xl min-[360px]:px-4 md:min-w-auto ${sleep.kind === 'off' ? 'bg-black/30 text-white/85 hover:bg-white/10' : 'bg-white/10 text-accent-soft'}`}>
                <MoonIcon className="h-[18px] w-[18px] shrink-0" /><span className="truncate">{sleepLabel(sleep)}</span>
              </button>
              <div className={`${pillBase} hidden min-w-0 flex-1 gap-2.5 bg-black/30 px-4 text-white/85 backdrop-blur-xl md:flex`}>
                <VolumeIcon className="h-5 w-5 shrink-0" />
                <Slider ariaLabel="Volume" fraction={volume} onChange={setVolume} />
              </div>
            </div>
          </div>

          {multi && (
            <section aria-label="Chapters" className="hidden h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-white/10 bg-black/35 backdrop-blur-2xl xl:flex">
              <div className="flex shrink-0 items-baseline justify-between px-5 pb-2.5 pt-[18px]">
                <h2 className="text-[18px] font-bold tracking-[-0.01em] text-ink">Chapters</h2>
                <span className="text-[13px] text-white/60">{book.chapters.length} · {length(book.duration)}</span>
              </div>
              <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                <ChapterList chapters={book.chapters} position={time} rate={rate} started followCurrent showProgress rowClass="h-[52px] px-3" onSelect={goToChapter} />
              </div>
            </section>
          )}
        </main>

        {/* The whole book, edge to edge: one segment per chapter, each a jump target,
            numbered so it reads as the same position as the scrubber at book scale. */}
        <footer className={`hidden shrink-0 flex-col gap-2.5 md:flex md:pb-[max(24px,env(safe-area-inset-bottom))] ${gutter}`}>
          <div className="flex items-baseline justify-between text-[13.5px] text-white/60">
            <span>Whole book · {bookPercent}% through</span>
            <span className="font-bold text-accent-soft">{timeLeft(book.duration - time, rate)}</span>
          </div>
          <ChapterSegments chapters={book.chapters} position={time} className="h-2.5" labels={multi} onSeek={multi ? goToChapter : undefined} />
        </footer>
        {/* Phones have no footer bar; keep the bottom safe area clear. */}
        <div aria-hidden="true" className="h-[max(18px,env(safe-area-inset-bottom))] shrink-0 md:hidden" />
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
