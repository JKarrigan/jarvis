'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence } from 'framer-motion'
import JellyfinPlayer from './JellyfinPlayer'
import { EpisodeList } from './EpisodeList'
import { useMedia } from './MediaProvider'
import { usePlaybackSelection, PlaybackPicker } from './PlaybackPicker'
import {
  ActionButton, AddToCollectionButton, BODY_PAD, CastRow, CreditsGrid, FileAndRating, TagsRow, criticColor,
} from './DetailSections'
import type { ReelDetail, ReelTitle, MediaInfo, ReelSeasonInfo } from './types'
import { backdropFallback, poster } from './artwork'
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

export function DetailView({
  detail, media, similar, autoPlay = false,
}: { detail: ReelDetail; media: MediaInfo | null; similar: ReelTitle[]; autoPlay?: boolean }) {
  const router = useRouter()
  const mediaState = useMedia()
  const {
    isFavorite, isWatched, inWatchlist, inPickList, isEpWatched,
    toggleFavorite, toggleWatched, toggleWatchlist, togglePickList,
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

      <CreditsGrid detail={detail} />

      <TagsRow tags={detail.tags} type={detail.type} />

      {/* Resume / up-next bar — sits below the show's metadata, above the episode/season list. */}
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

      {/* Seasons (TV) — multi-season shows get a season rail; single-season shows list every
          episode inline. Both sit below the metadata, before the details boxes. */}
      {detail.seasonList && detail.seasonList.length > 1 && (
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

      {detail.seasonList && detail.seasonList.length === 1 && (
        <section className="mt-10">
          <SectionHeader title="Episodes" />
          <EpisodeList detail={detail} season={detail.seasonList[0]} />
        </section>
      )}

      <FileAndRating selection={selection} itemId={detail.id} />

      <CastRow cast={detail.cast} />

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
