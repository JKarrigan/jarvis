'use client'

import { useState } from 'react'
import { MediaGrid } from '@/app/_components/media/MediaCard'
import { MOCK_TV } from '@/app/_components/media/mockData'

export default function TVPage() {
  const [search, setSearch] = useState('')
  const filtered = MOCK_TV.filter(m =>
    m.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <main className="py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 px-4 md:px-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">TV Shows</h1>
          <p className="text-sm text-zinc-500 mt-1">{MOCK_TV.length} shows</p>
        </div>
        <input
          type="search"
          placeholder="Search shows…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition-colors w-48"
        />
      </div>
      {filtered.length > 0
        ? <MediaGrid items={filtered} />
        : <p className="text-sm text-zinc-500 px-4 md:px-6">No results for &ldquo;{search}&rdquo;</p>
      }
    </main>
  )
}
