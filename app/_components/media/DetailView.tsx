'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence } from 'framer-motion'
import JellyfinPlayer from './JellyfinPlayer'
import { Sheet } from '@/app/_components/HueControls'
import { useMedia } from './MediaProvider'
import { usePlaybackSelection, PlaybackPicker } from './PlaybackPicker'
import { fetchCollections, createCollection, addToCollection, removeFromCollection } from './collectionsApi'
import type { ReelDetail, ReelTitle, MediaInfo, ReelSeasonInfo, CollectionSummary } from './types'
import { avatar, backdropFallback, poster } from './artwork'
import { Poster, PosterCard, Row, SectionHeader } from './ReelCards'
import {
  PlayIcon, StarIcon, CheckIcon, HeartIcon, BookmarkIcon, PlusIcon, ChevronLeftIcon, TomatoIcon,
} from './icons'

function runtimeLabel(t: ReelDetail): string {
  const bits: string[] = []
  if (t.year) bits.push(String(t.year))
  if (t.type === 'movie' && t.runtime) bits.push(`${Math.floor(t.runtime / 60)}h ${t.runtime % 60}m`)
  if (t.type === 'tv' && t.seasons) bits.push(`${t.seasons} Season${t.seasons > 1 ? 's' : ''}`)
  if (t.cert) bits.push(t.cert)
  return bits.join('  ·  ')
}

function criticColor(rt: number): string {
  if (rt >= 75) return '#7fd8a8'
  if (rt >= 60) return '#f0c25a'
  return '#e88'
}

/** Body text column padding. On desktop the left edge lines up under the title / Play
    button (page rail + poster width `md:w-[268px]` + the poster↔info flex gap `md:gap-7`),
    so the description, credits and tags share one left edge with the header above them. */
const BODY_PAD = 'pl-[var(--rail)] pr-[var(--gx)] md:pl-[calc(var(--rail)_+_268px_+_1.75rem)]'

/** First unwatched episode walking seasons in order (falls back to the first). */
function findNextEpisode(seasons: ReelSeasonInfo[] | undefined, isEpWatched: (id: string) => boolean) {
  if (!seasons || seasons.length === 0) return null
  const ordered = [...seasons].sort((a, b) => a.index - b.index)
  for (const s of ordered) {
    for (const e of [...s.episodes].sort((a, b) => a.index - b.index)) {
      if (!isEpWatched(e.id)) return { season: s, episode: e }
    }
  }
  const first = ordered[0]
  return first.episodes.length ? { season: first, episode: first.episodes[0] } : null
}

function ActionButton({
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

function CreditRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-white/40">{label}</dt>
      <dd className="min-w-0 text-white/80 [text-wrap:pretty]">{value}</dd>
    </div>
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

export function DetailView({
  detail, media, similar, autoPlay = false,
}: { detail: ReelDetail; media: MediaInfo | null; similar: ReelTitle[]; autoPlay?: boolean }) {
  const router = useRouter()
  const mediaState = useMedia()
  const {
    isFavorite, isWatched, inWatchlist, inPickList, isEpWatched, rating, notes,
    toggleFavorite, toggleWatched, toggleWatchlist, togglePickList, setRating, setNotes,
  } = mediaState

  const selection = usePlaybackSelection(media)

  const favorite = isFavorite(detail.id, detail.favorite)
  const watched = isWatched(detail.id, detail.watched)
  const inList = inPickList(detail.id)
  const onWatchlist = inWatchlist(detail.id)

  const next = useMemo(
    () => findNextEpisode(detail.seasonList, (id) => isEpWatched(id, false)),
    [detail.seasonList, isEpWatched],
  )

  // What "Play" launches: the movie itself, or the show's next episode.
  const playTarget = detail.type === 'tv'
    ? next ? { id: next.episode.id, title: `${detail.title} · S${next.season.index} E${next.episode.index}` } : null
    : { id: detail.id, title: detail.title }

  // Loading splash artwork — the episode still for TV, otherwise the title's backdrop.
  const splashUrl = detail.type === 'tv'
    ? next?.episode.imageUrl ?? detail.backdropUrl ?? detail.posterUrl
    : detail.backdropUrl ?? detail.posterUrl

  const [playing, setPlaying] = useState(autoPlay && Boolean(playTarget))
  const userRating = rating(detail.id)

  const resumeLabel = detail.type === 'movie' && detail.progress > 0 && detail.progress < 1 ? 'Resume' : 'Play'

  return (
    <div className="pb-20">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.back()}
        className="fixed left-4 top-3 z-50 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3.5 py-2 text-sm font-medium text-ink backdrop-blur-xl transition hover:bg-white/10 md:left-[86px]"
      >
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </button>

      {/* Backdrop */}
      <div className="relative h-[50vh] min-h-[360px] w-full overflow-hidden">
        <div className="absolute inset-0" style={{ animation: 'kenburns 1.1s ease' }}>
          <Poster gradient={detail.backdropUrl ? detail.backdropColor : backdropFallback(detail.hue)} src={detail.backdropUrl} alt={detail.title} rounded="rounded-none" className="h-full w-full" />
        </div>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,6,13,0.2), rgba(8,6,13,0.5) 60%, #0a0810)' }} />
      </div>

      {/* Poster overlaps the backdrop; the info column is pushed down (md:pt) so the
          title sits up at the backdrop's bottom edge. */}
      <div className="relative -mt-[90px] flex flex-col gap-5 pl-[var(--rail)] pr-[var(--gx)] md:-mt-[200px] md:flex-row md:items-start md:gap-7">
        <div className="w-[150px] shrink-0 md:w-[268px]" style={{ animation: 'posterRise 0.5s ease' }}>
          <div className="aspect-[2/3] w-full">
            <Poster gradient={detail.posterColor} src={detail.posterUrl} alt={detail.title} rounded="rounded-[16px]" className="h-full w-full shadow-[0_30px_70px_rgba(0,0,0,0.6)]" />
          </div>
        </div>

        <div className="min-w-0 flex-1 md:pt-[120px]">
          <div className="mb-2 flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">
              {detail.type === 'tv' ? 'Series' : 'Film'}
            </span>
            {watched && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-ink">
                <CheckIcon className="h-3 w-3" style={{ color: 'var(--accent)' }} /> Watched
              </span>
            )}
          </div>

          <h1 className="font-[800] leading-[1] tracking-[-0.028em] text-ink" style={{ fontSize: 'clamp(30px, 7.5vw, 52px)' }}>
            {detail.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-white/60">
            <span>{runtimeLabel(detail)}</span>
            {detail.imdb != null && (
              <>
                <span className="text-white/30">·</span>
                <span className="inline-flex items-center gap-1 text-white/80">
                  <StarIcon className="h-4 w-4" style={{ color: 'var(--star)' }} />
                  {detail.imdb.toFixed(1)}
                </span>
              </>
            )}
            {detail.rt != null && (
              <>
                <span className="text-white/30">·</span>
                <span className="inline-flex items-center gap-1 font-semibold" style={{ color: criticColor(detail.rt) }}>
                  <TomatoIcon className="h-4 w-4" />
                  {Math.round(detail.rt)}%
                </span>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {playTarget && (
              <ActionButton accent label={resumeLabel} onClick={() => setPlaying(true)}>
                <PlayIcon className="h-4 w-4" /> {resumeLabel}
              </ActionButton>
            )}
            <ActionButton active={favorite} label="Favorite" onClick={() => toggleFavorite(detail.id, detail.favorite)}>
              <HeartIcon className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} style={favorite ? { color: 'var(--fav)' } : undefined} />
            </ActionButton>
            <ActionButton active={watched} label="Mark watched" onClick={() => toggleWatched(detail.id, detail.watched)}>
              <CheckIcon className="h-4 w-4" />
            </ActionButton>
            <ActionButton active={inList} label="Add to picker list" onClick={() => togglePickList(detail.id)}>
              {inList ? <CheckIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
              {inList ? 'In picker list' : 'Add to picker list'}
            </ActionButton>
            <ActionButton active={onWatchlist} label="Watchlist" onClick={() => toggleWatchlist(detail.id)}>
              <BookmarkIcon className="h-4 w-4" fill={onWatchlist ? 'currentColor' : 'none'} />
            </ActionButton>
            <AddToCollectionButton titleId={detail.id} />
          </div>

          {/* Version / Audio / Subtitle selection (drives the player) */}
          <PlaybackPicker selection={selection} />
        </div>
      </div>

      {/* Resume / up-next bar */}
      {next && (
        <div className="mt-8 pl-[var(--rail)] pr-[var(--gx)]">
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-3">
            <button type="button" onClick={() => setPlaying(true)} className="relative h-[90px] w-[150px] shrink-0 overflow-hidden rounded-xl">
              <Poster gradient={backdropFallback(next.episode.hue)} src={next.episode.imageUrl} alt={next.episode.name} className="h-full w-full" />
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm"><PlayIcon className="h-4 w-4" /></span>
              </span>
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent-soft">Up next</p>
              <p className="truncate font-semibold text-ink">S{next.season.index} · E{next.episode.index} — {next.episode.name}</p>
              {next.episode.runtime && <p className="text-sm text-white/50">{next.episode.runtime}m</p>}
            </div>
          </div>
        </div>
      )}

      {/* Seasons (TV) — vertical poster cards */}
      {detail.seasonList && detail.seasonList.length > 0 && (
        <section className="mt-10">
          <SectionHeader title="Seasons" />
          <Row>
            {detail.seasonList.map(s => {
              const watchedCount = s.episodes.filter(e => isEpWatched(e.id, false)).length
              const pct = (watchedCount / Math.max(1, s.episodeCount)) * 100
              return (
                <Link key={s.id} href={`/media/tv/${detail.id}/season/${s.id}`} className="group flex w-[160px] shrink-0 flex-col gap-2">
                  <div className="relative aspect-[2/3] w-full transition-transform duration-200 group-hover:-translate-y-1">
                    <Poster gradient={poster(s.hue)} src={s.posterUrl} alt={s.name} className="h-full w-full shadow-[0_16px_34px_rgba(0,0,0,0.5)]" />
                    <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10 transition group-hover:ring-white/20" />
                    {watchedCount > 0 && (
                      <div className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/20">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{s.name}</p>
                    <p className="truncate text-[11.5px] text-white/45">
                      {s.episodeCount} episode{s.episodeCount === 1 ? '' : 's'}
                      {watchedCount > 0 ? ` · ${watchedCount} watched` : ''}
                    </p>
                  </div>
                </Link>
              )
            })}
          </Row>
        </section>
      )}

      {/* Tagline + overview */}
      {(detail.tagline || detail.synopsis) && (
        <section className={`mt-10 md:mt-2 ${BODY_PAD}`}>
          {detail.tagline && (
            <p className="mb-2 max-w-[820px] text-[15px] italic text-white/50 [text-wrap:pretty]">{detail.tagline}</p>
          )}
          {detail.synopsis && (
            <p className="max-w-[820px] text-[16px] leading-[1.7] text-white/75 [text-wrap:pretty]">{detail.synopsis}</p>
          )}
        </section>
      )}

      {(detail.directors.length > 0 || detail.writers.length > 0 || detail.studios.length > 0 || detail.genres.length > 0) && (
        <section className={`mt-6 pb-2 ${BODY_PAD}`}>
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
      )}

      {detail.tags && detail.tags.length > 0 && (
        <section className={`mt-5 ${BODY_PAD}`}>
          <div className="flex max-w-[820px] flex-wrap gap-2">
            {detail.tags.map(t => (
              <Link
                key={t}
                href={`/media/${detail.type === 'tv' ? 'tv' : 'movies'}?tag=${encodeURIComponent(t)}`}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] text-white/55 transition hover:border-white/20 hover:bg-white/10 hover:text-ink"
              >
                {t}
              </Link>
            ))}
          </div>
        </section>
      )}

      {detail.cast.length > 0 && (
        <section className="mt-8">
          <SectionHeader title="Cast & crew" />
          <Row>
            {detail.cast.map((c, i) => (
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
      )}

      {/* Details row: File · Your rating */}
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
              <button key={n} type="button" aria-label={`${n} stars`} onClick={() => setRating(detail.id, userRating === n ? 0 : n)}>
                <StarIcon className="h-7 w-7 transition" style={{ color: n <= userRating ? 'var(--star)' : 'rgba(255,255,255,0.18)' }} />
              </button>
            ))}
          </div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">Notes</p>
          <textarea
            defaultValue={notes(detail.id)}
            onBlur={(e) => setNotes(detail.id, e.target.value)}
            placeholder="Private notes…"
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-ink placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </section>

      {/* More from your library */}
      {similar.length > 0 && (
        <section className="mt-12">
          <SectionHeader title="More from your library" />
          <Row>{similar.filter(t => t.id !== detail.id).map(t => <PosterCard key={t.id} title={t} />)}</Row>
        </section>
      )}

      <AnimatePresence>
        {playing && playTarget && (
          <JellyfinPlayer
            itemId={playTarget.id}
            title={playTarget.title}
            splashUrl={splashUrl}
            versions={selection.versions}
            initialSourceId={selection.versionId || undefined}
            initialAudioIndex={selection.audioIndex}
            initialSubtitleIndex={selection.subtitleIndex}
            onClose={() => setPlaying(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function AddToCollectionButton({ titleId }: { titleId: string }) {
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
