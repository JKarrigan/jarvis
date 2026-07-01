'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence } from 'framer-motion'
import { Sheet } from '@/app/_components/HueControls'
import { useMedia } from './MediaProvider'
import type { PlaybackSelection } from './PlaybackPicker'
import { fetchCollections, createCollection, addToCollection, removeFromCollection } from './collectionsApi'
import type { ReelDetail, ReelCastMember, CollectionSummary } from './types'
import { avatar } from './artwork'
import { Row, SectionHeader } from './ReelCards'
import { StarIcon, CheckIcon, PlusIcon } from './icons'

/** Body text column padding. On desktop the left edge lines up under the title / Play
    button (page rail + poster width `md:w-[268px]` + the poster↔info flex gap `md:gap-7`),
    so the description, credits and tags share one left edge with the header above them. */
export const BODY_PAD = 'pl-[var(--rail)] pr-[var(--gx)] md:pl-[calc(var(--rail)_+_268px_+_1.75rem)]'

/** Rotten-Tomatoes-style critic score color. */
export function criticColor(rt: number): string {
  if (rt >= 75) return '#7fd8a8'
  if (rt >= 60) return '#f0c25a'
  return '#e88'
}

export function ActionButton({
  active, accent, label, onClick, children,
}: { active?: boolean; accent?: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${accent
        ? 'text-ink-on-accent shadow-[0_10px_30px_var(--glow)] hover:brightness-[1.06]'
        : 'border border-white/10 bg-white/5 text-ink backdrop-blur-md hover:bg-white/10'
        }`}
      style={accent ? { background: 'var(--accent)' } : active ? { color: 'var(--accent)' } : undefined}
    >
      {children}
    </button>
  )
}

export function CreditRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-white/40">{label}</dt>
      <dd className="min-w-0 text-white/80 [text-wrap:pretty]">{value}</dd>
    </div>
  )
}

/** Directors / writers / studios / genres definition list. */
export function CreditsGrid({ detail, pad = BODY_PAD }: { detail: ReelDetail; pad?: string }) {
  if (!(detail.directors.length > 0 || detail.writers.length > 0 || detail.studios.length > 0 || detail.genres.length > 0)) {
    return null
  }
  return (
    <section className={`mt-6 pb-2 ${pad}`}>
      <dl className="flex max-w-[820px] flex-col gap-y-2.5 text-sm">
        {detail.directors.length > 0 && <CreditRow label={detail.directors.length > 1 ? 'Directors' : 'Director'} value={detail.directors.join(', ')} />}
        {detail.writers.length > 0 && <CreditRow label={detail.writers.length > 1 ? 'Writers' : 'Writer'} value={detail.writers.join(', ')} />}
        {detail.studios.length > 0 && <CreditRow label={detail.studios.length > 1 ? 'Studios' : 'Studio'} value={detail.studios.join(', ')} />}
        {detail.genres.length > 0 && (
          <CreditRow
            label="Genres"
            value={detail.genres.map((g, i) => (
              <span key={g}>
                {i > 0 && ', '}
                <Link
                  href={`/media/${detail.type === 'tv' ? 'tv' : 'movies'}?genre=${encodeURIComponent(g)}`}
                  className="underline-offset-2 transition hover:text-ink hover:underline"
                >
                  {g}
                </Link>
              </span>
            ))}
          />
        )}
      </dl>
    </section>
  )
}

/** Free-form tag pills that link to a filtered browse page. */
export function TagsRow({ tags, type, pad = BODY_PAD }: { tags?: string[]; type: 'movie' | 'tv'; pad?: string }) {
  if (!tags || tags.length === 0) return null
  return (
    <section className={`mt-5 ${pad}`}>
      <div className="flex max-w-[820px] flex-wrap gap-2">
        {tags.map(t => (
          <Link
            key={t}
            href={`/media/${type === 'tv' ? 'tv' : 'movies'}?tag=${encodeURIComponent(t)}`}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] text-white/55 transition hover:border-white/20 hover:bg-white/10 hover:text-ink"
          >
            {t}
          </Link>
        ))}
      </div>
    </section>
  )
}

/** Horizontal "Cast & crew" rail of headshots linking to person pages. */
export function CastRow({ cast }: { cast: ReelCastMember[] }) {
  if (cast.length === 0) return null
  return (
    <section className="mt-8">
      <SectionHeader title="Cast & crew" />
      <Row>
        {cast.map((c, i) => (
          <Link key={`${c.id}-${i}`} href={`/media/person/${c.id}`} className="group flex w-[152px] shrink-0 flex-col gap-2">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl shadow-[0_16px_34px_rgba(0,0,0,0.5)] transition-transform duration-200 group-hover:-translate-y-1" style={{ background: avatar(c.hue) }}>
              {c.imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={c.imageUrl} alt={c.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                : <span className="absolute inset-0 grid place-items-center text-2xl font-bold text-white/85">{c.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>}
              <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10 transition group-hover:ring-white/20" />
              {c.isDirector && (
                <span className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ink-on-accent" style={{ background: 'var(--accent)' }}>Director</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-ink">{c.name}</p>
              {c.role && <p className="truncate text-[11.5px] text-white/45">{c.role}</p>}
            </div>
          </Link>
        ))}
      </Row>
    </section>
  )
}

/** Two-up grid: technical file details (from the selected version) + a private rating/notes box
    keyed by `itemId` (movie id or episode id). */
export function FileAndRating({ selection, itemId }: { selection: PlaybackSelection; itemId: string }) {
  const { rating, notes, setRating, setNotes } = useMedia()
  const userRating = rating(itemId)
  return (
    <section className="mt-10 grid gap-4 pl-[var(--rail)] pr-[var(--gx)] md:grid-cols-2">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="mb-3 text-sm font-semibold text-ink">File details</p>
        <dl className="space-y-2 text-[13px]">
          {([
            ['Resolution', selection.version?.resolution],
            ['Video', selection.version?.videoCodec],
            ['Audio', selection.version?.audio.find(a => a.index === selection.audioIndex)?.label],
            ['Container', selection.version?.container],
            ['Size', selection.version?.size],
          ] as const).filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-white/45">{k}</dt>
              <dd className="truncate text-right font-mono text-[12px] text-white/80">{v}</dd>
            </div>
          ))}
          {!selection.version && <p className="text-sm text-white/40">No file details available.</p>}
        </dl>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><StarIcon className="h-4 w-4 text-white/50" /> Your rating</p>
        <div className="mb-3 flex gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" aria-label={`${n} stars`} onClick={() => setRating(itemId, userRating === n ? 0 : n)}>
              <StarIcon className="h-7 w-7 transition" style={{ color: n <= userRating ? 'var(--star)' : 'rgba(255,255,255,0.18)' }} />
            </button>
          ))}
        </div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">Notes</p>
        <textarea
          defaultValue={notes(itemId)}
          onBlur={(e) => setNotes(itemId, e.target.value)}
          placeholder="Private notes…"
          rows={3}
          className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-ink placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
    </section>
  )
}

function AddToCollectionSheet({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const router = useRouter()
  const [collections, setCollections] = useState<CollectionSummary[] | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    fetchCollections().then(cols => { if (active) setCollections(cols) })
    return () => { active = false }
  }, [])

  // Re-pull server truth (after a create, or to revert a failed toggle) and revalidate SSR.
  const resync = async () => {
    setCollections(await fetchCollections())
    router.refresh()
  }

  const toggle = async (c: CollectionSummary) => {
    if (busy) return
    const inIt = c.itemIds.includes(titleId)
    setBusy(true)
    setCollections(cur => cur?.map(x => x.id === c.id
      ? { ...x, itemIds: inIt ? x.itemIds.filter(i => i !== titleId) : [...x.itemIds, titleId] }
      : x) ?? cur)
    const ok = inIt ? await removeFromCollection(c.id, titleId) : await addToCollection(c.id, titleId)
    setBusy(false)
    if (ok) router.refresh()
    else resync()
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    const id = await createCollection(n, [titleId])
    setBusy(false)
    if (id) { setName(''); resync() }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="space-y-3 p-5">
        <h3 className="text-lg font-semibold text-zinc-100">Add to collection</h3>
        {collections == null ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : collections.length === 0 ? (
          <p className="text-sm text-zinc-400">No collections yet — create one below.</p>
        ) : (
          <div className="space-y-1.5">
            {collections.map(c => {
              const inIt = c.itemIds.includes(titleId)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c)}
                  disabled={busy}
                  className="flex w-full items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 text-left transition hover:bg-zinc-800 disabled:opacity-60"
                >
                  <span className="grid h-5 w-5 place-items-center rounded-md border border-zinc-600">
                    {inIt && <CheckIcon className="h-3.5 w-3.5 text-amber-300" />}
                  </span>
                  <span className="text-sm text-zinc-100">{c.name}</span>
                  <span className="ml-auto text-xs text-zinc-500">{c.itemIds.length}</span>
                </button>
              )
            })}
          </div>
        )}
        <form onSubmit={create} className="flex gap-2 pt-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New collection name…"
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-300/40"
          />
          <button type="submit" className="rounded-xl bg-amber-300 px-4 text-sm font-semibold text-zinc-900 disabled:opacity-40" disabled={!name.trim() || busy}>
            Create
          </button>
        </form>
      </div>
    </Sheet>
  )
}

export function AddToCollectionButton({ titleId }: { titleId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ActionButton label="Add to collection" onClick={() => setOpen(true)}>
        <PlusIcon className="h-4 w-4" /> Collection
      </ActionButton>
      <AnimatePresence>{open && <AddToCollectionSheet titleId={titleId} onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  )
}
