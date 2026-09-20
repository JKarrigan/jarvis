'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import type { Audiobook, AudiobookDetail } from '../types'
import { useMedia } from '../MediaProvider'
import { CheckIcon, ChevronLeftIcon, HeartIcon, PauseIcon, PencilIcon, PlaySolidIcon, RestartIcon } from '../icons'
import { useAudiobookPlayer, useBookPosition } from './AudiobookPlayer'
import { BookProgress, ChapterList, Cover } from './parts'
import { chapterAt, length } from './format'
import { EditAudiobookSheet } from './EditAudiobookSheet'

/** Chapters shown before "Show all" — a window around where you are. */
const CHAPTER_WINDOW = 9

const GHOST = 'flex h-[50px] items-center gap-2.5 rounded-[13px] border border-border bg-surface-2 px-5 text-[15px] font-bold text-ink transition hover:bg-white/10 disabled:opacity-50'
const SQUARE = 'grid h-[50px] w-[50px] shrink-0 place-items-center rounded-full border border-border bg-surface-2 transition hover:bg-white/10 disabled:opacity-50'

export function AudiobookDetailView({ book, more }: { book: AudiobookDetail; more: Audiobook[] }) {
  const router = useRouter()
  const { isFavorite, toggleFavorite } = useMedia()
  const { book: loaded, playing, play, toggle, close } = useAudiobookPlayer()
  const position = useBookPosition(book)
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)

  const isLoaded = loaded?.id === book.id
  const started = !book.finished && position > 30
  const current = chapterAt(book.chapters, position)
  const multi = book.chapters.length > 1
  const fav = isFavorite(book.id, book.favorite)

  const windowStart = Math.max(0, Math.min((started ? current?.index ?? 0 : 0) - 3, book.chapters.length - CHAPTER_WINDOW))
  const visible = showAll ? book.chapters : book.chapters.slice(windowStart, windowStart + CHAPTER_WINDOW)

  async function setFinished(finished: boolean) {
    setBusy(true)
    try {
      await fetch(`/api/jellyfin/audiobooks/${book.id}/finished`, { method: finished ? 'POST' : 'DELETE' })
      // The loaded player holds the old position; drop it so it can't report it back.
      if (isLoaded) close()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function startOver() {
    setBusy(true)
    try {
      if (isLoaded) close()
      await fetch(`/api/jellyfin/audiobooks/${book.id}/finished`, { method: 'DELETE' })
      play(book.id, { fromStart: true })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const primaryLabel = isLoaded && playing
    ? 'Pause'
    : started
      ? multi && current ? `Resume ${current.title}` : 'Resume'
      : book.finished ? 'Listen again' : 'Play'

  return (
    <div className="relative pb-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[620px]" style={{ background: `radial-gradient(85% 100% at 30% 0%, hsl(${book.hue} 42% 26% / 0.75) 0%, transparent 72%)` }} />
      <button
        type="button"
        onClick={() => router.back()}
        className="absolute left-4 top-3 z-30 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3.5 py-2 text-sm font-medium text-ink backdrop-blur-xl transition hover:bg-white/10 md:left-[86px]"
      >
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </button>

      <div className="relative flex flex-col gap-10 pl-[var(--rail)] pr-[var(--gx)] pt-20 md:gap-12 md:pt-[104px]">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:gap-[52px]">
          <Cover book={book} rounded="rounded-[18px]" titleClass="text-[clamp(24px,3vw,38px)]" className="w-[min(60vw,240px)] shadow-[0_30px_70px_rgba(0,0,0,0.6)] md:w-[330px]" />
          <div className="flex min-w-0 max-w-[720px] flex-1 flex-col gap-3.5">
            <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-accent-soft">
              {['Audiobook', book.genres[0]].filter(Boolean).join(' · ')}
            </div>
            <h1 className="text-[clamp(30px,7.5vw,52px)] font-[800] leading-none tracking-[-0.028em] text-ink">{book.title}</h1>
            <div className="flex flex-col gap-0.5">
              {book.author && <div className="text-[18px] font-bold text-white/80">{book.author}</div>}
              {book.narrator && <div className="text-[15px] text-white/65">Read by {book.narrator}</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              {[book.year, length(book.duration), multi && `${book.chapters.length} chapters`, book.file?.container]
                .filter(Boolean)
                .map(chip => (
                  <span key={String(chip)} className="flex h-7 items-center rounded-lg border border-border bg-surface-2 px-2.5 text-[12.5px] font-bold text-white/80">{chip}</span>
                ))}
            </div>
            {started && (
              <div className="mt-2">
                <BookProgress chapters={book.chapters} position={position} duration={book.duration} barClass="h-2" />
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => (isLoaded ? toggle() : play(book.id))}
                className="flex h-[50px] items-center gap-2.5 rounded-[13px] bg-accent pl-5 pr-6 text-[15px] font-extrabold text-ink-on-accent shadow-[0_12px_34px_var(--glow)] transition hover:brightness-[1.06]"
              >
                {isLoaded && playing ? <PauseIcon className="h-[18px] w-[18px]" /> : <PlaySolidIcon className="h-[18px] w-[18px]" />}
                {primaryLabel}
              </button>
              {(started || book.finished) && (
                <button type="button" disabled={busy} onClick={startOver} className={GHOST}>
                  <RestartIcon className="h-[18px] w-[18px]" />Start over
                </button>
              )}
              <button type="button" aria-label={fav ? 'Remove favorite' : 'Favorite'} aria-pressed={fav} onClick={() => toggleFavorite(book.id, book.favorite)} className={`${SQUARE} ${fav ? 'text-[var(--fav)]' : 'text-ink'}`}>
                <HeartIcon className="h-[21px] w-[21px]" fill={fav ? 'currentColor' : 'none'} />
              </button>
              <button type="button" disabled={busy} aria-label={book.finished ? 'Mark as not finished' : 'Mark as finished'} title={book.finished ? 'Mark as not finished' : 'Mark as finished'} aria-pressed={book.finished} onClick={() => setFinished(!book.finished)} className={`${SQUARE} ${book.finished ? 'text-[var(--positive)]' : 'text-ink'}`}>
                <CheckIcon className="h-[21px] w-[21px]" />
              </button>
              <button type="button" aria-label="Edit details" title="Edit details" onClick={() => setEditing(true)} className={`${SQUARE} text-ink`}>
                <PencilIcon className="h-[19px] w-[19px]" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-[52px]">
          {multi && (
            <section className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[20px] font-bold tracking-[-0.01em] text-ink">Chapters</h2>
                {started && current && <div className="text-[13px] text-white/50">{current.index} of {book.chapters.length} finished</div>}
              </div>
              <motion.div layout transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }} className="overflow-hidden rounded-[18px] border border-border bg-surface p-2">
                <ChapterList
                  chapters={visible}
                  position={position}
                  started={started}
                  onSelect={i => play(book.id, { chapterIndex: i })}
                />
                {book.chapters.length > CHAPTER_WINDOW && (
                  <button type="button" onClick={() => setShowAll(s => !s)} className="h-12 w-full rounded-xl text-[13.5px] font-bold text-accent-soft transition-colors hover:bg-white/5">
                    {showAll ? 'Show fewer' : `Show all ${book.chapters.length} chapters`}
                  </button>
                )}
              </motion.div>
            </section>
          )}

          <aside className="flex shrink-0 flex-col gap-8 lg:w-[400px]">
            {book.synopsis && (
              <section className="flex flex-col gap-3">
                <h2 className="text-[20px] font-bold tracking-[-0.01em] text-ink">About</h2>
                <p className="text-[15px] leading-[1.65] text-white/80 [text-wrap:pretty]">{book.synopsis}</p>
              </section>
            )}
            {book.file && (
              <section className="flex flex-col gap-3">
                <h2 className="text-[20px] font-bold tracking-[-0.01em] text-ink">File</h2>
                <dl className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-surface px-[18px] py-4 text-[13px]">
                  {([['Container', book.file.container], ['Audio', book.file.audio], ['Size', book.file.size]] as const)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4">
                        <dt className="text-white/50">{k}</dt>
                        <dd className="font-mono text-[12.5px] text-white/80">{v}</dd>
                      </div>
                    ))}
                </dl>
              </section>
            )}
            {more.length > 0 && (
              <section className="flex flex-col gap-3.5">
                <h2 className="text-[20px] font-bold tracking-[-0.01em] text-ink">More by {book.author}</h2>
                <div className="flex flex-wrap gap-4">
                  {more.slice(0, 6).map(b => (
                    <Link key={b.id} href={`/media/audiobooks/${b.id}`} aria-label={b.title} className="transition hover:-translate-y-1">
                      <Cover book={b} rounded="rounded-xl" titleClass="text-[15px]" showAuthor={false} className="w-[118px] shadow-[0_16px_34px_rgba(0,0,0,0.5)]" />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
      <AnimatePresence>{editing && <EditAudiobookSheet book={book} onClose={() => setEditing(false)} />}</AnimatePresence>
    </div>
  )
}
