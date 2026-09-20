'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import type { ReelTitle, CollectionSummary, Audiobook } from './types'
import { Cover } from './audiobooks/parts'
import { collArt } from './artwork'
import { Poster, detailHref } from './ReelCards'
import { SearchIcon, CloseIcon } from './icons'

export function SearchModal({
  catalog, collections, audiobooks, onClose,
}: { catalog: ReelTitle[]; collections: CollectionSummary[]; audiobooks: Audiobook[]; onClose: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const { titles, colls, books } = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return { titles: [] as ReelTitle[], colls: [] as CollectionSummary[], books: [] as Audiobook[] }
    return {
      titles: catalog.filter(t => t.title.toLowerCase().includes(needle)).slice(0, 8),
      colls: collections.filter(c => c.name.toLowerCase().includes(needle)).slice(0, 4),
      // Books also match on who wrote or reads them.
      books: audiobooks
        .filter(b => [b.title, b.author, b.narrator].some(v => v?.toLowerCase().includes(needle)))
        .slice(0, 5),
    }
  }, [q, catalog, collections, audiobooks])

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
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <SearchIcon className="h-5 w-5 text-white/40" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search movies, shows, audiobooks, collections…"
            className="flex-1 bg-transparent py-4 text-[15px] text-ink placeholder:text-white/35 focus:outline-none"
          />
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {q.trim() && titles.length === 0 && colls.length === 0 && books.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-white/45">No matches for “{q}”.</p>
          )}

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

          {titles.map(t => (
            <button key={t.id} type="button" onClick={() => go(detailHref(t))} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/5">
              <div className="h-12 w-9 shrink-0">
                <Poster gradient={t.posterColor} src={t.posterUrl} alt={t.title} rounded="rounded-md" className="h-full w-full" />
              </div>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{t.title}</span>
                <span className="block truncate text-xs text-white/45">{[t.year, t.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
