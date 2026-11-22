'use client'

import { useMemo, useState } from 'react'
import { useRouter, notFound } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import { Sheet } from './Sheet'
import { BackPill } from './BackPill'
import type { ReelTitle, CollectionSummary } from './types'
import { BACKDROP_WIDTHS, collArt, collColor, imageSrcSet } from './artwork'
import { effectiveRuntime } from './selectors'
import { Poster } from './ReelCards'
import { TitleRowWide } from './LibraryList'
import { PencilIcon, TrashIcon } from './icons'
import { deleteCollection, renameCollection } from './collectionsApi'

function totalHours(titles: ReelTitle[]): number {
  return Math.round(titles.reduce((s, t) => s + effectiveRuntime(t), 0) / 60)
}

export function CollectionDetail({
  catalog, collection,
}: { catalog: ReelTitle[]; collection: CollectionSummary | null }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(collection?.name ?? '')

  const byId = useMemo(() => new Map(catalog.map(t => [t.id, t])), [catalog])

  if (!collection) {
    notFound()
  }

  async function confirmDelete() {
    if (deleting || !collection) return
    setDeleting(true)
    const ok = await deleteCollection(collection.id)
    if (ok) {
      router.push('/media/collections')
      router.refresh()
    } else {
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  const titles = collection.itemIds.map(id => byId.get(id)).filter((t): t is ReelTitle => Boolean(t))
  // When the collection has no backdrop of its own, blend a few members' art into the hero.
  const montage = collection.montageUrls ?? []

  return (
    <div className="relative pb-20">
      <BackPill fallbackHref="/media/collections" />

      {/* Banner: the collection's own art, else a montage of its films, else a gradient */}
      <div className="relative h-[80vh] min-h-[360px] w-full overflow-hidden">
        <div className="absolute inset-0" style={{ animation: 'kenburns 1.1s ease' }}>
          {collection.backdropUrl ? (
            <Poster gradient={collArt(collection.hue)} src={collection.backdropUrl} srcSet={imageSrcSet(collection.backdropUrl, BACKDROP_WIDTHS)} sizes="100vw" priority alt={collection.name} rounded="rounded-none" className="h-full w-full" />
          ) : montage.length > 0 ? (
            <div className="flex h-full w-full scale-105 blur-[3px]">
              {montage.map((url, i) => (
                <Poster
                  key={i}
                  gradient={collArt(collection.hue)}
                  src={url}
                  srcSet={imageSrcSet(url, [480, 960, 1280])}
                  sizes={`${Math.ceil(100 / montage.length)}vw`}
                  priority
                  alt=""
                  rounded="rounded-none"
                  className="h-full min-w-0 flex-1"
                />
              ))}
            </div>
          ) : collection.posterUrl ? (
            <Poster gradient={collArt(collection.hue)} src={collection.posterUrl} priority alt={collection.name} rounded="rounded-none" className="h-full w-full" />
          ) : (
            <div className="h-full w-full" style={{ background: collArt(collection.hue) }} />
          )}
        </div>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,6,13,0.4), rgba(8,6,13,0.6) 55%, #0a0810)' }} />
        <div className="absolute inset-x-0 bottom-0 max-w-[calc(var(--rail)+664px)] pb-9 pl-[var(--rail)] pr-[var(--gx)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: collColor(collection.hue) }}>Collection</p>
          {collection.logoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={collection.logoUrl}
                alt={name}
                width={600}
                height={224}
                decoding="async"
                className="mt-2 max-h-[112px] max-w-[78%] object-contain object-left drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]"
              />
              <h1 className="sr-only">{name}</h1>
            </>
          ) : (
            <h1 className="mt-1 text-[clamp(34px,8vw,58px)] font-[800] leading-[1] tracking-[-0.025em] text-ink">{name}</h1>
          )}
          {collection.tagline && <p className="mt-3 max-w-[600px] text-[15px] leading-[1.6] text-white/70">{collection.tagline}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <p className="mr-1 text-sm text-white/55">{titles.length} title{titles.length === 1 ? '' : 's'} · {totalHours(titles)}h total</p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-ink backdrop-blur-md transition hover:bg-white/10"
            >
              <PencilIcon className="h-3.5 w-3.5" /> Edit name
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,122,122,0.4)] bg-[rgba(255,122,122,0.12)] px-3.5 py-1.5 text-sm font-semibold text-[color:var(--pass)] backdrop-blur-md transition hover:bg-[rgba(255,122,122,0.2)]"
            >
              <TrashIcon className="h-3.5 w-3.5" /> Delete collection
            </button>
          </div>
        </div>
      </div>

      <section className="mt-9">
        <h2 className="mb-4 pl-[var(--rail)] pr-[var(--gx)] text-[20px] font-bold text-ink">In this collection</h2>

        {titles.length === 0 ? (
          <p className="pl-[var(--rail)] pr-[var(--gx)] text-sm text-white/45">This collection is empty.</p>
        ) : (
          <div className="space-y-2 pl-[var(--rail)] pr-[var(--gx)]">
            {titles.map((t, i) => <TitleRowWide key={t.id} title={t} index={i + 1} />)}
          </div>
        )}
      </section>

      <AnimatePresence>
        {editing && (
          <EditNameSheet
            collectionId={collection.id}
            current={name}
            onClose={() => setEditing(false)}
            onSaved={(n) => { setName(n); setEditing(false); router.refresh() }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmingDelete && (
          <DeleteConfirmSheet
            name={name}
            busy={deleting}
            onConfirm={confirmDelete}
            onClose={() => { if (!deleting) setConfirmingDelete(false) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function EditNameSheet({
  collectionId, current, onSaved, onClose,
}: { collectionId: string; current: string; onSaved: (name: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(current)
  const [busy, setBusy] = useState(false)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = value.trim()
    if (!n || busy) return
    setBusy(true)
    const ok = await renameCollection(collectionId, n)
    setBusy(false)
    if (ok) onSaved(n)
  }

  return (
    <Sheet onClose={onClose} label="Rename collection">
      <form onSubmit={save} className="space-y-4 p-5">
        <h3 className="text-lg font-semibold text-zinc-100">Rename collection</h3>
        <input
          data-autofocus
          aria-label="Collection name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Collection name…"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-300/40"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800">Cancel</button>
          <button type="submit" disabled={!value.trim() || busy} className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-zinc-900 transition disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Sheet>
  )
}

function DeleteConfirmSheet({
  name, busy, onConfirm, onClose,
}: { name: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label="Delete collection?">
      <div className="space-y-4 p-5">
        <h3 className="text-lg font-semibold text-zinc-100">Delete collection?</h3>
        <p className="text-sm text-zinc-400">
          “{name}” will be removed. The titles themselves aren’t deleted.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-40">Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60"
            style={{ background: 'var(--pass)', color: '#2b0b0b' }}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
