'use client'

import { useMemo, useState } from 'react'
import { useRouter, notFound } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import { Sheet } from '@/app/_components/HueControls'
import { useMedia } from './MediaProvider'
import type { ReelTitle, CollectionSummary } from './types'
import { collArt, collColor, backdropFallback } from './artwork'
import { effectiveRuntime } from './selectors'
import { Poster, detailHref } from './ReelCards'
import { StarIcon, CheckIcon, ChevronLeftIcon, PlayIcon, PencilIcon, TrashIcon } from './icons'
import { deleteCollection, renameCollection } from './collectionsApi'

function totalHours(titles: ReelTitle[]): number {
  return Math.round(titles.reduce((s, t) => s + effectiveRuntime(t), 0) / 60)
}

function meta(t: ReelTitle): string {
  const bits: string[] = []
  if (t.year) bits.push(String(t.year))
  if (t.type === 'movie' && t.runtime) bits.push(`${Math.floor(t.runtime / 60)}h ${t.runtime % 60}m`)
  if (t.type === 'tv' && t.seasons) bits.push(`${t.seasons} Season${t.seasons > 1 ? 's' : ''}`)
  return bits.join(' · ')
}

export function CollectionDetail({
  catalog, collection,
}: { catalog: ReelTitle[]; collection: CollectionSummary | null }) {
  const router = useRouter()
  const { isWatched, toggleWatched } = useMedia()
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
      <button
        type="button"
        onClick={() => router.back()}
        className="absolute left-4 top-3 z-50 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3.5 py-2 text-sm font-medium text-ink backdrop-blur-xl transition hover:bg-white/10 md:left-[86px]"
      >
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </button>

      {/* Banner: the collection's own art, else a montage of its films, else a gradient */}
      <div className="relative h-[80vh] min-h-[360px] w-full overflow-hidden">
        <div className="absolute inset-0" style={{ animation: 'kenburns 1.1s ease' }}>
          {collection.backdropUrl ? (
            <Poster gradient={collArt(collection.hue)} src={collection.backdropUrl} alt={collection.name} rounded="rounded-none" className="h-full w-full" />
          ) : montage.length > 0 ? (
            <div className="flex h-full w-full scale-105 blur-[3px]">
              {montage.map((url, i) => (
                <Poster
                  key={i}
                  gradient={collArt(collection.hue)}
                  src={url}
                  alt=""
                  rounded="rounded-none"
                  className="h-full min-w-0 flex-1"
                />
              ))}
            </div>
          ) : collection.posterUrl ? (
            <Poster gradient={collArt(collection.hue)} src={collection.posterUrl} alt={collection.name} rounded="rounded-none" className="h-full w-full" />
          ) : (
            <div className="h-full w-full" style={{ background: collArt(collection.hue) }} />
          )}
        </div>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,6,13,0.4), rgba(8,6,13,0.6) 55%, #0a0810)' }} />
        <div className="absolute inset-x-0 bottom-0 max-w-[760px] pb-9 pl-[var(--rail)] pr-[var(--gx)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: collColor(collection.hue) }}>Collection</p>
          {collection.logoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={collection.logoUrl}
                alt={name}
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
          <div className="space-y-3 pl-[var(--rail)] pr-[var(--gx)]">
            {titles.map(t => {
              const watched = isWatched(t.id, t.watched)
              return (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(detailHref(t))}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') router.push(detailHref(t)) }}
                  className="group flex cursor-pointer items-center gap-5 rounded-2xl p-2 transition hover:bg-surface"
                >
                  <div className="relative aspect-video w-[220px] shrink-0 overflow-hidden rounded-xl sm:w-[340px]">
                    <Poster gradient={t.backdropUrl ? t.backdropColor : backdropFallback(t.hue)} src={t.backdropUrl} alt={t.title} className="h-full w-full" />
                    <button
                      type="button"
                      aria-label={`Play ${t.title}`}
                      onClick={(ev) => { ev.stopPropagation(); router.push(`${detailHref(t)}?play=1`) }}
                      className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    >
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm"><PlayIcon className="h-5 w-5" /></span>
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{t.title}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/45">
                      {t.imdb != null && <span className="inline-flex items-center gap-1"><StarIcon className="h-3.5 w-3.5" style={{ color: 'var(--star)' }} />{t.imdb.toFixed(1)}</span>}
                      <span>{meta(t)}</span>
                    </p>
                    {t.synopsis && <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-white/55 [text-wrap:pretty]">{t.synopsis}</p>}
                  </div>

                  <button
                    type="button"
                    aria-label={watched ? 'Mark unwatched' : 'Mark watched'}
                    onClick={(ev) => { ev.stopPropagation(); toggleWatched(t.id, t.watched) }}
                    className="grid h-9 w-9 shrink-0 place-items-center self-center rounded-full border transition"
                    style={watched
                      ? { background: 'var(--accent)', borderColor: 'transparent', color: 'var(--ink-on-accent)' }
                      : { borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)' }}
                  >
                    <CheckIcon className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
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
    <Sheet onClose={onClose}>
      <form onSubmit={save} className="space-y-4 p-5">
        <h3 className="text-lg font-semibold text-zinc-100">Rename collection</h3>
        <input
          autoFocus
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
    <Sheet onClose={onClose}>
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
