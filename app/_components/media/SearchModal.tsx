'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import type { ReelTitle, CollectionSummary, Audiobook, Ebook } from './types'
import { BookCover } from './books/BooksView'
import { Cover } from './audiobooks/parts'
import { collArt, avatar, hueFromId } from './artwork'
import { Poster, detailHref } from './ReelCards'
import { SearchIcon, CloseIcon } from './icons'

/** A person matched by name, aggregated across every title they're credited on. */
interface PersonHit {
  id: string
  name: string
  imageUrl?: string
  directed: number
  acted: number
}

/** A title match, plus the credit that matched when the title itself didn't. */
interface TitleHit {
  t: ReelTitle
  via?: string
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
}

function personBlurb(p: PersonHit): string {
  const role = p.directed && p.acted ? 'Director & actor' : p.directed ? 'Director' : 'Actor'
  const n = p.directed + p.acted
  return `${role} · ${n} ${n === 1 ? 'title' : 'titles'} in your library`
}

export function SearchModal({
  catalog, collections, audiobooks, ebooks, onClose,
}: { catalog: ReelTitle[]; collections: CollectionSummary[]; audiobooks: Audiobook[]; ebooks: Ebook[]; onClose: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const { titles, people, colls, books, reads } = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return { titles: [] as TitleHit[], people: [] as PersonHit[], colls: [] as CollectionSummary[], books: [] as Audiobook[], reads: [] as Ebook[] }

    // Titles match on their name or on anyone credited (director / cast); the people
    // themselves are collected across the catalog so a name links to its person page.
    const byPerson = new Map<string, PersonHit>()
    const byTitle: TitleHit[] = []
    const byCredit: TitleHit[] = []
    for (const t of catalog) {
      let via: string | undefined
      for (const c of t.people ?? []) {
        if (!c.name.toLowerCase().includes(needle)) continue
        const hit = byPerson.get(c.id) ?? { id: c.id, name: c.name, directed: 0, acted: 0 }
        hit.imageUrl ??= c.imageUrl
        if (c.director) hit.directed++
        else hit.acted++
        byPerson.set(c.id, hit)
        via ??= c.director ? `Directed by ${c.name}` : `With ${c.name}`
      }
      if (t.title.toLowerCase().includes(needle)) byTitle.push({ t })
      else if (via) byCredit.push({ t, via })
    }

    return {
      titles: [...byTitle, ...byCredit].slice(0, 10),
      people: [...byPerson.values()]
        .sort((a, b) => (b.directed + b.acted) - (a.directed + a.acted) || a.name.localeCompare(b.name))
        .slice(0, 4),
      colls: collections.filter(c => c.name.toLowerCase().includes(needle)).slice(0, 4),
      // Books also match on who wrote or reads them.
      books: audiobooks
        .filter(b => [b.title, b.author, b.narrator].some(v => v?.toLowerCase().includes(needle)))
        .slice(0, 5),
      reads: ebooks
        .filter(b => [b.title, b.author].some(v => v?.toLowerCase().includes(needle)))
        .slice(0, 5),
    }
  }, [q, catalog, collections, audiobooks, ebooks])

  const go = (href: string) => { onClose(); router.push(href) }

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[12vh]">
      <motion.div
        className="absolute inset-0"
        style={{ background: 'rgba(4,3,8,0.66)', backdropFilter: 'blur(8px)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.16 } }}
        onClick={onClose}
      />
      <motion.div
        className="relative z-10 w-full max-w-[640px] overflow-hidden rounded-[18px] border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl"
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.16, ease: 'easeIn' } }}
        transition={{ type: 'spring', bounce: 0.18, duration: 0.34 }}
      >
        <div className="flex items-center gap-3 px-5">
          <SearchIcon className="h-6 w-6 text-white/40" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search movies, shows, people, books, collections…"
            className="flex-1 bg-transparent py-5 text-[18px] text-ink placeholder:text-white/35 focus:outline-none"
          />
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* The results panel only exists once there's a query, so the empty modal is just
            the input — it unfolds beneath as you type. */}
        <AnimatePresence initial={false}>
          {q.trim() && (
            <motion.div
              key="results"
              className="overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: { duration: 0.16 } }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            >
            <div className="max-h-[55vh] overflow-y-auto border-t border-white/10 p-2">
              {titles.length === 0 && people.length === 0 && colls.length === 0 && books.length === 0 && reads.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-white/45">No matches for “{q}”.</p>
              )}

              {people.map(p => (
                <button key={p.id} type="button" onClick={() => go(`/media/person/${p.id}`)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/5">
                  {/* Round avatar centred in the poster-width slot so names stay aligned. */}
                  <span className="grid h-12 w-9 shrink-0 place-items-center">
                    {p.imageUrl
                      ? <Poster gradient={avatar(hueFromId(p.id))} src={p.imageUrl} alt={p.name} rounded="rounded-full" className="h-9 w-9" />
                      : (
                        <span className="grid h-9 w-9 place-items-center rounded-full text-[12px] font-bold text-white/90" style={{ background: avatar(hueFromId(p.id)) }}>
                          {initials(p.name)}
                        </span>
                      )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                    <span className="block truncate text-xs text-white/45">{personBlurb(p)}</span>
                  </span>
                </button>
              ))}

              {colls.map(c => (
                <button key={c.id} type="button" onClick={() => go(`/media/collections/${c.id}`)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/5">
                  <span className="h-12 w-9 shrink-0 rounded-md" style={{ background: collArt(c.hue) }} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                    <span className="block text-xs text-white/45">Collection · {c.itemIds.length} films</span>
                  </span>
                </button>
              ))}

              {books.map(b => (
                <button key={b.id} type="button" onClick={() => go(`/media/audiobooks/${b.id}`)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/5">
                  {/* Square cover centred in the poster-width slot so titles stay aligned. */}
                  <span className="grid h-12 w-9 shrink-0 place-items-center">
                    <Cover book={b} rounded="rounded-md" titleClass="" className="w-9" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{b.title}</span>
                    <span className="block truncate text-xs text-white/45">{['Audiobook', b.author, b.narrator && `read by ${b.narrator}`].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              ))}

              {reads.map(b => (
                <button key={b.id} type="button" onClick={() => go(`/media/books/${b.id}`)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/5">
                  <BookCover book={b} titleClass="" className="h-12 w-9 overflow-hidden rounded-md bg-white" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{b.title}</span>
                    <span className="block truncate text-xs text-white/45">{['Book', b.author, b.level != null && `Level ${b.level}`].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              ))}

              {titles.map(({ t, via }) => (
                <button key={t.id} type="button" onClick={() => go(detailHref(t))} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/5">
                  <div className="h-12 w-9 shrink-0">
                    <Poster gradient={t.posterColor} src={t.posterUrl} alt={t.title} rounded="rounded-md" className="h-full w-full" />
                  </div>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{t.title}</span>
                    <span className="block truncate text-xs text-white/45">{[t.year, via ?? t.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              ))}
            </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
