'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useMedia } from './MediaProvider'
import type { ReelTitle } from './types'
import { Poster, detailHref } from './ReelCards'
import { CloseIcon, DieIcon } from './icons'

export function PickListView({ catalog }: { catalog: ReelTitle[] }) {
  const { pickList, removeFromPickList, clearPickList } = useMedia()
  const byId = useMemo(() => new Map(catalog.map(t => [t.id, t])), [catalog])
  const titles = pickList.map(id => byId.get(id)).filter((t): t is ReelTitle => Boolean(t))

  return (
    <div className="mx-auto max-w-[1000px] px-[var(--rail)] py-12 md:px-[var(--gx)]">
      <h1 className="text-[clamp(34px,7vw,52px)] font-[800] tracking-[-0.025em] text-ink">Your picker list</h1>
      <p className="mt-2 text-white/55">Queue up contenders, then run the roundup to narrow them down.</p>

      {titles.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-white/55">Your list is empty. Add titles with “Add to picker list” on any detail page.</p>
          <Link href="/media" className="mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold text-ink-on-accent" style={{ background: 'var(--accent)' }}>Browse the library</Link>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/media/picker?list=1" className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-ink-on-accent shadow-[0_12px_34px_var(--glow)]" style={{ background: 'var(--accent)' }}>
              <DieIcon className="h-4 w-4" /> Start the roundup
            </Link>
            <button type="button" onClick={clearPickList} className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-white/10">Clear list</button>
          </div>

          <div className="mt-8 grid gap-x-5 gap-y-7" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--grid-min), 1fr))' }}>
            {titles.map(t => (
              <div key={t.id} className="group relative">
                <Link href={detailHref(t)} className="block">
                  <div className="aspect-[2/3] w-full"><Poster gradient={t.posterColor} src={t.posterUrl} alt={t.title} className="h-full w-full" /></div>
                  <p className="mt-2 truncate text-[13.5px] font-semibold text-ink">{t.title}</p>
                </Link>
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => removeFromPickList(t.id)}
                  className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100 hover:bg-black/75"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
