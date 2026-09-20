'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import type { Ebook } from '../types'
import { poster } from '../artwork'
import { Poster, SectionHeader, Row } from '../ReelCards'
import { CheckIcon, HeadphonesIcon } from '../icons'
import { BooksSwitch } from './BooksSwitch'
import { openBook, renderPage } from './pdf'

const bookHref = (id: string) => `/media/books/${id}`
const reading = (b: Ebook) => !b.finished && (b.page ?? 1) > 1

/** Portrait cover; with no image yet, the hue gradient carries the title. */
export function BookCover({ book, className = '', titleClass = 'text-[16px]' }: { book: Pick<Ebook, 'title' | 'author' | 'hue' | 'coverUrl'>; className?: string; titleClass?: string }) {
  return (
    <div className={`relative aspect-[5/7] shrink-0 ${className}`}>
      <Poster gradient={poster(book.hue)} src={book.coverUrl} alt="" rounded="rounded-[11px]" className="h-full w-full" />
      {!book.coverUrl && titleClass && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-[9%]">
          <div className={`font-[family-name:var(--font-schibsted)] font-extrabold leading-[1.15] ${titleClass}`}>{book.title}</div>
          {book.author && <div className="text-[10.5px] font-bold text-white/70">{book.author}</div>}
        </div>
      )}
    </div>
  )
}

export function BookCard({ book, className = '' }: { book: Ebook; className?: string }) {
  return (
    <Link href={bookHref(book.id)} className={`group flex min-w-0 flex-col gap-2.5 ${className}`}>
      <div className="relative overflow-hidden rounded-[11px] bg-white shadow-[0_16px_34px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/10 transition duration-300 group-hover:-translate-y-1 group-hover:ring-white/20">
        <BookCover book={book} className="w-full" />
        {book.finished && (
          <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-accent text-ink-on-accent">
            <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.6} />
          </span>
        )}
        {book.audioId && (
          <span title="Has narration" className="absolute bottom-2.5 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-accent-soft backdrop-blur-md">
            <HeadphonesIcon className="h-4 w-4" />
          </span>
        )}
        {reading(book) && book.pages && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <span className="block h-full bg-accent" style={{ width: `${((book.page ?? 1) / book.pages) * 100}%` }} />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="truncate text-[14px] font-semibold text-ink">{book.title}</div>
        {book.author && <div className="truncate text-[12.5px] text-white/50">{book.author}</div>}
        <div className={`text-[12.5px] font-semibold ${reading(book) ? 'text-accent-soft' : 'text-white/50'}`}>
          {/* Level goes here, not over the art — graded readers print it on the cover already. */}
          {[
            book.level != null && `Level ${book.level}`,
            book.finished ? 'Finished' : reading(book) ? `Page ${book.page} of ${book.pages}` : book.pages ? `${book.pages} pages` : null,
          ].filter(Boolean).join(' · ') || '\u00a0'}
        </div>
      </div>
    </Link>
  )
}

/**
 * Jellyfin makes no cover for a PDF. For each book without one, render page 1 here and
 * hand it to the server, which stores it on the Jellyfin item — a one-time job per book,
 * done one at a time so a fresh library doesn't open a dozen PDFs at once.
 */
function useCoverBackfill(books: Ebook[]) {
  const router = useRouter()
  const running = useRef(false)
  const attempted = useRef(new Set<string>())
  useEffect(() => {
    const todo = books.filter(b => !b.coverUrl && !attempted.current.has(b.id))
    if (running.current || todo.length === 0) return
    running.current = true
    let cancelled = false
    void (async () => {
      let saved = 0
      for (const b of todo) {
        if (cancelled) break
        attempted.current.add(b.id)
        try {
          const { doc, close } = await openBook(b.id)
          try {
            const canvas = document.createElement('canvas')
            const { done } = await renderPage(doc, 1, canvas, 600, 900)
            await done
            const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.86))
            if (blob) {
              const res = await fetch(`/api/jellyfin/books/${b.id}/cover`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
              if (res.ok) saved++
            }
          } finally {
            close()
          }
        } catch { /* unreadable PDF: it keeps its gradient cover */ }
      }
      running.current = false
      if (saved > 0 && !cancelled) router.refresh()
    })()
    return () => { cancelled = true; running.current = false }
  }, [books, router])
}

export function BooksView({ books }: { books: Ebook[] }) {
  useCoverBackfill(books)
  const levels = useMemo(() => [...new Set(books.map(b => b.level).filter((l): l is number => l != null))].sort((a, b) => a - b), [books])
  const [level, setLevel] = useState<number | 'all'>('all')
  const [audioOnly, setAudioOnly] = useState(false)
  const anyAudio = books.some(b => b.audioId)
  const continuing = useMemo(() => books.filter(reading).sort((a, b) => (b.readAt ?? 0) - (a.readAt ?? 0)), [books])
  const shown = useMemo(
    () => books.filter(b => (level === 'all' || b.level === level) && (!audioOnly || b.audioId)),
    [books, level, audioOnly],
  )

  const chip = (value: number | 'all', label: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={level === value}
      onClick={() => setLevel(value)}
      className={`h-10 whitespace-nowrap rounded-[11px] px-3.5 text-[13.5px] font-bold transition-colors ${level === value ? 'bg-surface-2 text-accent-soft' : 'text-white/65 hover:text-white'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="pb-8 pt-16 md:pt-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 pl-[var(--rail)] pr-[var(--gx)]">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-[34px] font-[800] tracking-[-0.02em] text-ink">Books</h1>
          <BooksSwitch active="read" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {anyAudio && (
            <button
              type="button"
              aria-pressed={audioOnly}
              onClick={() => setAudioOnly(a => !a)}
              className={`flex h-12 items-center gap-2 whitespace-nowrap rounded-[14px] border border-border px-4 text-[13.5px] font-bold transition-colors ${audioOnly ? 'bg-surface-2 text-accent-soft' : 'bg-surface text-white/65 hover:text-white'}`}
            >
              <HeadphonesIcon className="h-4 w-4" />With audio
            </button>
          )}
          {levels.length > 1 && (
            <div className="flex gap-0.5 rounded-[14px] border border-border bg-surface p-1">
              {chip('all', 'All levels')}
              {levels.map(l => chip(l, `Level ${l}`))}
            </div>
          )}
        </div>
      </div>

      {books.length === 0 ? (
        <div className="ml-[var(--rail)] mr-[var(--gx)] max-w-[620px] rounded-[22px] border border-border bg-surface p-7">
          <h2 className="text-[20px] font-bold tracking-[-0.01em] text-ink">No books yet</h2>
          <p className="mt-2 text-[15px] leading-[1.65] text-white/70">
            In Jellyfin, add a <span className="font-semibold text-ink">Books</span> library pointing at a folder of PDFs laid out as
            Author / Title / Title.pdf. They appear here after the library scan.
          </p>
        </div>
      ) : (
        <>
          {continuing.length > 0 && level === 'all' && !audioOnly && (
            <section className="mb-9">
              <SectionHeader title="Continue reading" />
              <Row>{continuing.map(b => <BookCard key={b.id} book={b} className="w-[150px] shrink-0 md:w-[178px]" />)}</Row>
            </section>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${level}-${audioOnly}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
              className="grid gap-x-5 gap-y-7 pl-[var(--rail)] pr-[var(--gx)]"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--grid-min), 1fr))' }}
            >
              {shown.map(b => <BookCard key={b.id} book={b} />)}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  )
}
