'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MediaGrid, type MediaItem } from './MediaCard'

export default function MediaLibrary({
  title,
  countNoun,
  items,
  searchPlaceholder,
}: {
  title: string
  countNoun: string
  items: MediaItem[]
  searchPlaceholder: string
}) {
  const [search, setSearch] = useState('')
  const filtered = search
    ? items.filter(m => m.title.toLowerCase().includes(search.toLowerCase()))
    : items

  return (
    <main className="py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 px-4 md:px-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{title}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {items.length} {countNoun}
          </p>
        </div>
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition-colors w-48"
        />
      </div>

      <AnimatePresence mode="wait">
        {filtered.length > 0 ? (
          <motion.div
            key={search ? 'results' : 'all'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <MediaGrid items={filtered} />
          </motion.div>
        ) : (
          <motion.p
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm text-zinc-500 px-4 md:px-6"
          >
            No results for &ldquo;{search}&rdquo;
          </motion.p>
        )}
      </AnimatePresence>
    </main>
  )
}
