'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import type { Audiobook } from '../types'
import { FilterDropdown } from '../FilterDropdown'
import { SectionHeader } from '../ReelCards'
import { CheckIcon, ListIcon, PlaySolidIcon } from '../icons'
import { useAudiobookPlayer, useBookPosition } from './AudiobookPlayer'
import { Cover } from './parts'
import { length, timeLeft } from './format'

type Group = 'all' | 'author' | 'narrator'
type Sort = 'added' | 'title' | 'author' | 'length'

const SORTS: { value: Sort; label: string }[] = [
  { value: 'added', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'length', label: 'Length' },
]

const bookHref = (id: string) => `/media/audiobooks/${id}`
const inProgress = (b: Audiobook, position: number) => !b.finished && position > 30 && position < b.duration - 10

function BookCard({ book }: { book: Audiobook }) {
  const position = useBookPosition(book)
  const started = inProgress(book, position)
  return (
    <Link href={bookHref(book.id)} className="group flex min-w-0 flex-col gap-2.5">
      <div className="relative overflow-hidden rounded-[13px] shadow-[0_16px_34px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/10 transition duration-300 group-hover:-translate-y-1 group-hover:ring-white/20">
        <Cover book={book} rounded="rounded-[13px]" className="w-full" />
        {book.finished && (
          <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full bg-accent text-ink-on-accent">
            <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.6} />
          </span>
        )}
        {started && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <span className="block h-full bg-accent" style={{ width: `${(position / book.duration) * 100}%` }} />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="truncate text-[14px] font-semibold text-ink">{book.title}</div>
        {book.author && <div className="truncate text-[12.5px] text-white/50">{book.author}</div>}
        <div className={`text-[12.5px] font-semibold ${started ? 'text-accent-soft' : 'text-white/50'}`}>
          {book.finished ? 'Finished' : started ? timeLeft(book.duration - position) : length(book.duration)}
        </div>
      </div>
    </Link>
  )
}

function BookGrid({ books }: { books: Audiobook[] }) {
  return (
    <div
      className="grid gap-x-5 gap-y-7 pl-[var(--rail)] pr-[var(--gx)]"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--grid-min), 1fr))' }}
    >
      {books.map(b => <BookCard key={b.id} book={b} />)}
    </div>
  )
}

/** The book you're in the middle of, front and centre, with the others alongside. */
function ContinueListening({ books }: { books: Audiobook[] }) {
  const { play, book: loaded, playing, toggle } = useAudiobookPlayer()
  const [lead, ...rest] = books
  const position = useBookPosition(lead)
  const isLoaded = loaded?.id === lead.id
  return (
    <section aria-label="Continue listening" className="mx-[var(--gx)] ml-[var(--rail)] mb-9 flex flex-col gap-6 overflow-hidden rounded-[22px] border border-border p-4 md:flex-row md:gap-9 md:p-[26px]"
      style={{ background: `radial-gradient(70% 160% at 0% 0%, hsl(${lead.hue} 48% 30% / 0.5), transparent 70%), var(--surface)` }}
    >
      <div className="flex min-w-0 flex-1 gap-4 md:gap-9">
        <Link href={bookHref(lead.id)} aria-label={lead.title} className="shrink-0">
          <Cover book={lead} rounded="rounded-2xl" titleClass="text-[13px] md:text-[26px]" showAuthor={false} className="w-[92px] shadow-[0_18px_40px_rgba(0,0,0,0.55)] md:w-[218px]" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:gap-2">
          <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-accent-soft">Continue listening</div>
          <h2 className="text-[19px] font-[800] leading-[1.08] tracking-[-0.025em] text-ink md:text-[36px]">
            <Link href={bookHref(lead.id)}>{lead.title}</Link>
          </h2>
          <div className="truncate text-[12.5px] text-white/65 md:text-[15px]">
            {[lead.author, lead.narrator && `read by ${lead.narrator}`].filter(Boolean).join(' · ')}
          </div>
          <div className="flex-1" />
          <div className="flex items-center justify-between gap-3 text-[13.5px]">
            <span className="font-bold text-accent-soft">{timeLeft(lead.duration - position)}</span>
            <span className="text-white/50">{length(lead.duration)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <div className="h-full bg-accent" style={{ width: `${Math.min(100, (position / (lead.duration || 1)) * 100)}%` }} />
          </div>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={() => (isLoaded ? toggle() : play(lead.id))}
              className="flex h-[50px] items-center gap-2.5 rounded-[13px] bg-accent pl-5 pr-6 text-[15px] font-extrabold text-ink-on-accent shadow-[0_12px_34px_var(--glow)] transition hover:brightness-[1.06]"
            >
              <PlaySolidIcon className="h-[18px] w-[18px]" />{isLoaded && playing ? 'Pause' : 'Resume'}
            </button>
            <Link href={bookHref(lead.id)} className="hidden h-[50px] items-center gap-2.5 rounded-[13px] border border-border bg-surface-2 px-5 text-[15px] font-bold text-ink transition hover:bg-white/10 md:flex">
              <ListIcon className="h-[18px] w-[18px]" />Chapters
            </Link>
          </div>
        </div>
      </div>
      {rest.length > 0 && (
        <div className="flex shrink-0 flex-col gap-4 border-t border-border pt-5 md:w-[360px] md:border-l md:border-t-0 md:pl-9 md:pt-0">
          <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-white/50">Also in progress</div>
          {rest.slice(0, 2).map(b => <AlsoRow key={b.id} book={b} />)}
        </div>
      )}
    </section>
  )
}

function AlsoRow({ book }: { book: Audiobook }) {
  const position = useBookPosition(book)
  return (
    <Link href={bookHref(book.id)} className="group flex items-center gap-4">
      <Cover book={book} rounded="rounded-[11px]" titleClass="text-[11px]" showAuthor={false} className="w-[76px] shadow-[0_10px_24px_rgba(0,0,0,0.5)]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="truncate text-[15px] font-bold text-ink group-hover:text-accent-soft">{book.title}</div>
        {book.author && <div className="truncate text-[12.5px] text-white/50">{book.author}</div>}
        <div className="h-1 overflow-hidden rounded-full bg-white/15">
          <div className="h-full bg-accent" style={{ width: `${(position / (book.duration || 1)) * 100}%` }} />
        </div>
        <div className="text-[12.5px] font-semibold text-accent-soft">{timeLeft(book.duration - position)}</div>
      </div>
    </Link>
  )
}

function sortBooks(books: Audiobook[], sort: Sort): Audiobook[] {
  const by = [...books]
  if (sort === 'title') by.sort((a, b) => a.title.localeCompare(b.title))
  else if (sort === 'author') by.sort((a, b) => (a.author ?? '~').localeCompare(b.author ?? '~') || a.title.localeCompare(b.title))
  else if (sort === 'length') by.sort((a, b) => b.duration - a.duration)
  else by.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
  return by
}

export function AudiobooksView({ books }: { books: Audiobook[] }) {
  const [group, setGroup] = useState<Group>('all')
  const [sort, setSort] = useState<Sort>('added')
  const hasNarrators = books.some(b => b.narrator)

  const continuing = useMemo(
    () => books.filter(b => inProgress(b, b.position)).sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0)),
    [books],
  )
  const sorted = useMemo(() => sortBooks(books, sort), [books, sort])
  const groups = useMemo(() => {
    if (group === 'all') return []
    const map = new Map<string, Audiobook[]>()
    for (const b of sortBooks(books, 'title')) {
      const key = (group === 'author' ? b.author : b.narrator) ?? 'Unknown'
      map.set(key, [...(map.get(key) ?? []), b])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [books, group])

  const tabs: { value: Group; label: string }[] = [
    { value: 'all', label: 'All books' },
    { value: 'author', label: 'Authors' },
    ...(hasNarrators ? [{ value: 'narrator' as const, label: 'Narrators' }] : []),
  ]

  return (
    <div className="pb-8 pt-16 md:pt-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 pl-[var(--rail)] pr-[var(--gx)]">
        <h1 className="text-[34px] font-[800] tracking-[-0.02em] text-ink">Audiobooks</h1>
        {books.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-0.5 rounded-[14px] border border-border bg-surface p-1">
              {tabs.map(t => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={group === t.value}
                  onClick={() => setGroup(t.value)}
                  className={`h-10 whitespace-nowrap rounded-[11px] px-3.5 text-[13.5px] font-bold transition-colors ${group === t.value ? 'bg-surface-2 text-accent-soft' : 'text-white/65 hover:text-white'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {group === 'all' && <FilterDropdown label="Sort" value={sort} options={SORTS} onChange={setSort} />}
          </div>
        )}
      </div>

      {books.length === 0 ? (
        <div className="ml-[var(--rail)] mr-[var(--gx)] max-w-[620px] rounded-[22px] border border-border bg-surface p-7">
          <h2 className="text-[20px] font-bold tracking-[-0.01em] text-ink">No audiobooks yet</h2>
          <p className="mt-2 text-[15px] leading-[1.65] text-white/70">
            In Jellyfin, add a library with the content type <span className="font-semibold text-ink">Books</span> and point it at
            your audiobooks folder — one folder per book, a single M4B inside. Books appear here after the library scan.
          </p>
        </div>
      ) : (
        <>
          {continuing.length > 0 && <ContinueListening books={continuing} />}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={group}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
            >
              {group === 'all' ? (
                <BookGrid books={sorted} />
              ) : (
                <div className="flex flex-col gap-10">
                  {groups.map(([name, list]) => (
                    <section key={name}>
                      <SectionHeader title={name} />
                      <BookGrid books={list} />
                    </section>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  )
}
