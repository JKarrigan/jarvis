'use client'

import { useEffect, useRef } from 'react'
import type { Audiobook, AudiobookChapter } from '../types'
import { poster } from '../artwork'
import { Poster } from '../ReelCards'
import { CheckIcon, VolumeIcon } from '../icons'
import { chapterAt, clock, timeLeft } from './format'

/**
 * Square audiobook cover. With no Jellyfin image the hue gradient carries a
 * typeset title, so an untagged library still reads as a shelf of books.
 */
export function Cover({
  book, className = '', rounded = 'rounded-xl', titleClass = 'text-[17px]', showAuthor = true,
}: {
  book: Pick<Audiobook, 'title' | 'author' | 'hue' | 'coverUrl'>
  className?: string
  rounded?: string
  /** Font size of the fallback title; pass '' to hide it on tiny covers. */
  titleClass?: string
  showAuthor?: boolean
}) {
  return (
    <div className={`relative aspect-square shrink-0 ${className}`}>
      <Poster gradient={poster(book.hue)} src={book.coverUrl} alt="" rounded={rounded} className="h-full w-full" />
      {!book.coverUrl && titleClass && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-[8%]">
          <div className={`font-[family-name:var(--font-schibsted)] font-extrabold leading-[1.05] tracking-[-0.02em] ${titleClass}`}>
            {book.title}
          </div>
          {showAuthor && book.author && (
            <div className="text-[0.56rem] font-bold uppercase tracking-[0.13em] text-white/70">{book.author}</div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Whole-book progress drawn as one segment per chapter, each sized by its length —
 * the shape of the book at a glance. `onSeek` makes the segments chapter jump targets.
 */
export function ChapterSegments({
  chapters, position, className = 'h-1.5', onSeek,
}: {
  chapters: AudiobookChapter[]
  position: number
  className?: string
  onSeek?: (chapterIndex: number) => void
}) {
  // Past ~120 chapters the 2px gaps would eat the bar; drop them.
  const gap = chapters.length > 120 ? 'gap-0' : 'gap-[2px]'
  return (
    <div className={`flex w-full ${gap} ${className}`} role="presentation">
      {chapters.map(c => {
        const fill = Math.min(1, Math.max(0, (position - c.start) / (c.duration || 1)))
        const bar = (
          <span className="block h-full w-full overflow-hidden rounded-[2px] bg-white/15">
            <span className="block h-full bg-accent" style={{ width: `${fill * 100}%` }} />
          </span>
        )
        return onSeek ? (
          <button
            key={c.index}
            type="button"
            title={c.title}
            aria-label={`Go to ${c.title}`}
            onClick={() => onSeek(c.index)}
            // Tall invisible hit area around a thin bar.
            className="-my-3 h-auto min-w-0 basis-0 py-3 transition-opacity hover:opacity-80"
            style={{ flexGrow: c.duration || 1 }}
          >
            <span className={`block ${className}`}>{bar}</span>
          </button>
        ) : (
          <span key={c.index} className="h-full min-w-0 basis-0" style={{ flexGrow: c.duration || 1 }}>{bar}</span>
        )
      })}
    </div>
  )
}

/** "Chapter 14 of 30 · 11 min left in chapter" + whole-book time left, over the segment bar. */
export function BookProgress({
  chapters, position, duration, barClass, onSeek,
}: {
  chapters: AudiobookChapter[]
  position: number
  duration: number
  barClass?: string
  onSeek?: (chapterIndex: number) => void
}) {
  const current = chapterAt(chapters, position)
  const multi = chapters.length > 1
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 text-[13.5px]">
        <div className="min-w-0 truncate">
          {multi && current ? (
            <>
              <span className="font-bold text-white/80">{current.title}</span>
              <span className="text-white/50"> · {timeLeft(current.start + current.duration - position)} in chapter</span>
            </>
          ) : (
            <span className="font-bold text-white/80">{clock(position)}</span>
          )}
        </div>
        <div className="shrink-0 font-bold text-accent-soft">{timeLeft(duration - position)}</div>
      </div>
      <ChapterSegments chapters={chapters} position={position} className={barClass} onSeek={onSeek} />
    </div>
  )
}

/** Chapter rows: finished ✓, current (speaker + time left), upcoming (number). */
export function ChapterList({
  chapters, position, started, onSelect, rowClass = 'h-[54px] px-3.5', followCurrent = false,
}: {
  chapters: AudiobookChapter[]
  /** Book position in seconds. */
  position: number
  /** False for a never-started book: no row is marked current. */
  started: boolean
  onSelect: (index: number) => void
  rowClass?: string
  /** Keep the current chapter scrolled into view (for the now-playing panel). */
  followCurrent?: boolean
}) {
  const current = started ? chapterAt(chapters, position) : undefined
  const currentRef = useRef<HTMLButtonElement>(null)
  const currentIndex = current?.index
  useEffect(() => {
    if (followCurrent) currentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [followCurrent, currentIndex])

  return (
    <div className="flex flex-col gap-0.5">
      {chapters.map(c => {
        const isCurrent = c.index === currentIndex
        const done = started && !isCurrent && c.start + c.duration <= position + 0.25
        return (
          <button
            key={c.index}
            ref={isCurrent ? currentRef : undefined}
            type="button"
            onClick={() => onSelect(c.index)}
            aria-current={isCurrent ? 'true' : undefined}
            className={`flex w-full items-center gap-4 rounded-xl text-left transition-colors ${rowClass} ${isCurrent
              ? 'bg-surface-2 text-accent-soft'
              : `hover:bg-white/5 ${done ? 'text-white/60' : 'text-ink'}`
              }`}
          >
            <span className="grid w-6 shrink-0 place-items-center">
              {isCurrent ? <VolumeIcon className="h-[18px] w-[18px] text-accent" />
                : done ? <CheckIcon className="h-4 w-4 text-[var(--positive)]" />
                  : <span className="text-[13px] font-bold tabular-nums text-white/50">{c.index + 1}</span>}
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{c.title}</span>
            {isCurrent && (
              <span className="shrink-0 text-[12.5px] font-bold text-accent-soft">
                {timeLeft(c.start + c.duration - position)}
              </span>
            )}
            <span className="w-14 shrink-0 text-right text-[13px] tabular-nums text-white/50">{clock(c.duration)}</span>
          </button>
        )
      })}
    </div>
  )
}
