'use client'

import Link from 'next/link'
import type { Audiobook } from '../types'
import { PauseIcon, PlaySolidIcon } from '../icons'
import { useAudiobookPlayer, useBookPosition } from './AudiobookPlayer'
import { Cover } from './parts'
import { timeLeft } from './format'

/** Home-row card for a book in progress. The play button starts it in the persistent
    player without leaving the page; the rest of the card opens the book. */
export function ListenCard({ book }: { book: Audiobook }) {
  const { book: loaded, playing, play, toggle } = useAudiobookPlayer()
  const position = useBookPosition(book)
  const isLoaded = loaded?.id === book.id
  const active = isLoaded && playing
  return (
    <div className="relative flex w-[340px] shrink-0 items-center gap-3.5 rounded-2xl border border-border p-3 transition hover:-translate-y-1"
      style={{ background: `radial-gradient(90% 160% at 0% 0%, hsl(${book.hue} 48% 30% / 0.45), transparent 70%), var(--surface)` }}
    >
      <Link href={`/media/audiobooks/${book.id}`} aria-label={book.title} className="shrink-0">
        <Cover book={book} rounded="rounded-[11px]" titleClass="text-[11px]" showAuthor={false} className="w-[84px] shadow-[0_10px_24px_rgba(0,0,0,0.5)]" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Link href={`/media/audiobooks/${book.id}`} className="line-clamp-2 text-[14.5px] font-bold leading-[1.2] text-ink hover:text-accent-soft">{book.title}</Link>
        {book.author && <div className="truncate text-[12.5px] text-white/50">{book.author}</div>}
        <div className="h-1 overflow-hidden rounded-full bg-white/15">
          <div className="h-full bg-accent" style={{ width: `${Math.min(100, (position / (book.duration || 1)) * 100)}%` }} />
        </div>
        <div className="text-[12.5px] font-semibold text-accent-soft">{timeLeft(book.duration - position)}</div>
      </div>
      <button
        type="button"
        aria-label={active ? `Pause ${book.title}` : `Resume ${book.title}`}
        onClick={() => (isLoaded ? toggle() : play(book.id))}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-ink-on-accent shadow-[0_8px_22px_var(--glow)] transition hover:brightness-[1.06]"
      >
        {active ? <PauseIcon className="h-[18px] w-[18px]" /> : <PlaySolidIcon className="h-[18px] w-[18px]" />}
      </button>
    </div>
  )
}
