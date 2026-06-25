'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReelTitle, CollectionSummary } from './types'
import { collColor } from './artwork'
import { PosterCard } from './ReelCards'
import { ChevronRightIcon, PlusIcon } from './icons'
import { createCollection } from './collectionsApi'

function CollectionRow({
  id, name, hue, count, titles,
}: { id: string; name: string; hue: number; count: number; titles: ReelTitle[] }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
      <div className="shrink-0 md:w-[340px] md:pl-[var(--rail)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: collColor(hue) }}>Collection</p>
        <h2 className="mt-1 text-[clamp(24px,4vw,32px)] font-[800] leading-[1.05] tracking-[-0.02em] text-ink [text-wrap:balance]">{name}</h2>
        <Link href={`/media/collections/${id}`} className="mt-1 inline-flex items-center gap-1 text-sm text-white/55 transition hover:text-white">
          {count} title{count === 1 ? '' : 's'} <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="min-w-0 flex-1">
        {titles.length === 0 ? (
          <p className="py-6 pl-[var(--rail)] pr-[var(--gx)] text-sm text-white/40 md:pl-0">
            No titles yet — add some from any detail page with “Add to collection”.
          </p>
        ) : (
          <div className="scrollbar-hide -my-3 flex gap-4 overflow-x-auto py-3 pl-[var(--rail)] pr-[var(--gx)] md:pl-0">
            {titles.map(t => <PosterCard key={t.id} title={t} width="w-[150px] md:w-[218px]" />)}
          </div>
        )}
      </div>
    </div>
  )
}

export function CollectionsList({ catalog, collections }: { catalog: ReelTitle[]; collections: CollectionSummary[] }) {
  const router = useRouter()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const byId = useMemo(() => new Map(catalog.map(t => [t.id, t])), [catalog])
  const resolve = (ids: string[]) => ids.map(id => byId.get(id)).filter((t): t is ReelTitle => Boolean(t))

  const rows = collections.map(c => ({ ...c, titles: resolve(c.itemIds) }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    const id = await createCollection(name)
    setCreating(false)
    if (id) {
      setNewName('')
      router.refresh()
    }
  }

  return (
    <div className="py-10">
      <div className="mb-6 pl-[var(--rail)] pr-[var(--gx)]">
        <h1 className="text-[clamp(34px,8vw,58px)] font-[800] tracking-[-0.025em] text-ink">Collections</h1>
        <p className="mt-2 text-white/55">Franchises, sagas, and your own — stored on the server.</p>

        <form onSubmit={submit} className="mt-5 flex max-w-[420px] gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New collection name…"
            className="flex-1 rounded-xl border border-border bg-white/5 px-3 py-2 text-sm text-ink placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={!newName.trim() || creating}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-ink-on-accent disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            <PlusIcon className="h-4 w-4" /> {creating ? 'Creating…' : 'Create'}
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="pl-[var(--rail)] pr-[var(--gx)] text-sm text-white/45">
          No collections yet. Create one above, then add titles from any detail page with “Add to collection”.
        </p>
      ) : (
        <section className="space-y-12">
          {rows.map(c => (
            <CollectionRow key={c.id} id={c.id} name={c.name} hue={c.hue} count={c.titles.length} titles={c.titles} />
          ))}
        </section>
      )}
    </div>
  )
}
