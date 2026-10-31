'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import type { SearchIndex, SearchPerson } from './types'
import { BookCover } from './books/BooksView'
import { Cover } from './audiobooks/parts'
import { avatar, collArt, hueFromId, poster } from './artwork'
import { Poster, detailHref } from './ReelCards'
import { SearchIcon, CloseIcon } from './icons'
import { useDialog } from './hooks'

// The index is fetched when the modal opens (not baked into every page) and reused
// for a short while so reopening is instant.
let cached: { at: number; index: SearchIndex } | null = null
const FRESH_MS = 60_000

function loadIndex(signal: AbortSignal): Promise<SearchIndex> {
  if (cached && Date.now() - cached.at < FRESH_MS) return Promise.resolve(cached.index)
  return fetch('/api/media/search-index', { signal })
    .then(r => (r.ok ? (r.json() as Promise<SearchIndex>) : Promise.reject(new Error(String(r.status)))))
    .then(index => {
      cached = { at: Date.now(), index }
      return index
    })
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
}

function personBlurb(p: SearchPerson): string {
  const role = p.directed.length && p.acted.length ? 'Director & actor' : p.directed.length ? 'Director' : 'Actor'
  const n = p.directed.length + p.acted.length
  return `${role} · ${n} ${n === 1 ? 'title' : 'titles'} in your library`
}

interface Result {
  key: string
  href: string
  art: React.ReactNode
  title: string
  sub: string
}

export function SearchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const listId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  const [index, setIndex] = useState<SearchIndex | null>(null)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState(0)

  useDialog(panelRef, onClose)

  useEffect(() => {
    const ac = new AbortController()
    loadIndex(ac.signal).then(setIndex, () => { if (!ac.signal.aborted) setFailed(true) })
    return () => ac.abort()
  }, [])

  const results = useMemo<Result[]>(() => {
    const needle = q.trim().toLowerCase()
    if (!needle || !index) return []
    const has = (...vals: (string | undefined)[]) => vals.some(v => v?.toLowerCase().includes(needle))

    // People match by name; their titles then match too ("Directed by …" / "With …"),
    // listed after the titles whose own name matches.
    const people = index.people
      .filter(p => has(p.name))
      .sort((a, b) => (b.directed.length + b.acted.length) - (a.directed.length + a.acted.length) || a.name.localeCompare(b.name))
    const via = new Map<number, string>()
    for (const p of people) for (const i of p.directed) if (!via.has(i)) via.set(i, `Directed by ${p.name}`)
    for (const p of people) for (const i of p.acted) if (!via.has(i)) via.set(i, `With ${p.name}`)
    type TitleHit = { t: SearchIndex['titles'][number]; via?: string }
    const byTitle: TitleHit[] = []
    const byCredit: TitleHit[] = []
    index.titles.forEach((t, i) => {
      if (has(t.title)) byTitle.push({ t })
      else if (via.has(i)) byCredit.push({ t, via: via.get(i) })
    })

    return [
      ...people.slice(0, 4).map(p => ({
        key: `p-${p.id}`,
        href: `/media/person/${p.id}`,
        // Round avatar centred in the poster-width slot so names stay aligned.
        art: (
          <span className="grid h-12 w-9 shrink-0 place-items-center">
            {p.imageUrl
              ? <Poster gradient={avatar(hueFromId(p.id))} src={p.imageUrl} alt="" rounded="rounded-full" className="h-9 w-9" />
              : (
                <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full text-[12px] font-bold text-white/90" style={{ background: avatar(hueFromId(p.id)) }}>
                  {initials(p.name)}
                </span>
              )}
          </span>
        ),
        title: p.name,
        sub: personBlurb(p),
      })),
      ...index.collections.filter(c => has(c.name)).slice(0, 4).map(c => ({
        key: `c-${c.id}`,
        href: `/media/collections/${c.id}`,
        art: <span className="h-12 w-9 shrink-0 rounded-md" style={{ background: collArt(c.hue) }} />,
        title: c.name,
        sub: `Collection · ${c.count} ${c.count === 1 ? 'title' : 'titles'}`,
      })),
      // Books also match on who wrote or reads them.
      ...index.audiobooks.filter(b => has(b.title, b.author, b.narrator)).slice(0, 5).map(b => ({
        key: `a-${b.id}`,
        href: `/media/audiobooks/${b.id}`,
        // Square cover centred in the poster-width slot so titles stay aligned.
        art: <span className="grid h-12 w-9 shrink-0 place-items-center"><Cover book={b} rounded="rounded-md" titleClass="" className="w-9" /></span>,
        title: b.title,
        sub: ['Audiobook', b.author, b.narrator && `read by ${b.narrator}`].filter(Boolean).join(' · '),
      })),
      ...index.ebooks.filter(b => has(b.title, b.author)).slice(0, 5).map(b => ({
        key: `e-${b.id}`,
        href: `/media/books/${b.id}`,
        art: <BookCover book={b} titleClass="" className="h-12 w-9 overflow-hidden rounded-md bg-white" />,
        title: b.title,
        sub: ['Book', b.author, b.level != null && `Level ${b.level}`].filter(Boolean).join(' · '),
      })),
      ...[...byTitle, ...byCredit].slice(0, 10).map(({ t, via: credit }) => ({
        key: `t-${t.id}`,
        href: detailHref(t),
        art: (
          <div className="h-12 w-9 shrink-0">
            <Poster gradient={poster(t.hue)} src={t.posterUrl} alt="" rounded="rounded-md" className="h-full w-full" />
          </div>
        ),
        title: t.title,
        sub: [t.year, credit ?? t.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · '),
      })),
    ]
  }, [q, index])

  const activeIndex = Math.min(active, Math.max(0, results.length - 1))

  // Keep the highlighted result in view while arrowing through the list.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const go = (href: string) => { onClose(); router.push(href) }

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((activeIndex + 1) % results.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((activeIndex - 1 + results.length) % results.length) }
    else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); setActive(0) }
    else if (e.key === 'End' && e.ctrlKey) { e.preventDefault(); setActive(results.length - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[activeIndex].href) }
  }

  const optionId = (i: number) => `${listId}-opt-${i}`
  const trimmed = q.trim()

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[12vh]">
      <motion.div
        className="absolute inset-0"
        style={{ background: 'rgba(4,3,8,0.66)', backdropFilter: 'blur(8px)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.16 } }}
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search the library"
        className="relative z-10 w-full max-w-[640px] overflow-hidden rounded-[18px] border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl"
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.16, ease: 'easeIn' } }}
        transition={{ type: 'spring', bounce: 0.18, duration: 0.34 }}
      >
        <div className="flex items-center gap-3 px-5">
          <SearchIcon className="h-6 w-6 text-white/40" aria-hidden="true" />
          <input
            data-autofocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0) }}
            onKeyDown={onInputKey}
            role="combobox"
            aria-label="Search movies, shows, people, books and collections"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results.length ? optionId(activeIndex) : undefined}
            placeholder="Search movies, shows, people, books, collections…"
            className="flex-1 bg-transparent py-5 text-[18px] text-ink placeholder:text-white/35 focus:outline-none"
          />
          <button type="button" onClick={onClose} aria-label="Close search" className="grid h-9 w-9 place-items-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* The results panel only exists once there's a query, so the empty modal is just
            the input — it unfolds beneath as you type. */}
        <AnimatePresence initial={false}>
          {trimmed && (
            <motion.div
              key="results"
              className="overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: { duration: 0.16 } }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            >
            <div ref={listRef} id={listId} role="listbox" aria-label="Results" className="max-h-[55vh] overflow-y-auto border-t border-white/10 p-2">
              {!index && !failed && <p className="px-3 py-6 text-center text-sm text-white/45">Loading the library…</p>}
              {failed && !index && <p className="px-3 py-6 text-center text-sm text-white/45">Couldn’t load the library index. Try again in a moment.</p>}
              {index && results.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-white/45">No matches for “{q}”.</p>
              )}
              {results.map((r, i) => (
                <div
                  key={r.key}
                  id={optionId(i)}
                  data-index={i}
                  role="option"
                  aria-selected={i === activeIndex}
                  onClick={() => go(r.href)}
                  onMouseMove={() => { if (i !== activeIndex) setActive(i) }}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition ${i === activeIndex ? 'bg-white/[0.07]' : ''}`}
                >
                  {r.art}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{r.title}</span>
                    <span className="block truncate text-xs text-white/45">{r.sub}</span>
                  </span>
                </div>
              ))}
            </div>
            </motion.div>
          )}
        </AnimatePresence>
        <p className="sr-only" aria-live="polite">
          {trimmed && index ? `${results.length} result${results.length === 1 ? '' : 's'}` : ''}
        </p>
      </motion.div>
    </div>
  )
}
