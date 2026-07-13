'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, notFound } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import JellyfinPlayer from './JellyfinPlayer'
import { useMedia } from './MediaProvider'
import { usePlaybackSelection, PlaybackPicker } from './PlaybackPicker'
import {
  ActionButton, CastRow, CreditsGrid, FileAndRating, TagsRow, BODY_PAD, criticColor,
} from './DetailSections'
import type { ReelDetail, ReelEpisodeDetail, ReelTitle, MediaInfo } from './types'
import { backdropFallback, poster } from './artwork'
import { Poster, PosterCard, Row, SectionHeader } from './ReelCards'
import { PlayIcon, StarIcon, CheckIcon, HeartIcon, TomatoIcon, ChevronLeftIcon } from './icons'

export function EpisodeDetail({
  detail, episode, seasonId, episodeId, media, similar,
}: {
  detail: ReelDetail
  episode: ReelEpisodeDetail | null
  seasonId: string
  episodeId: string
  media: MediaInfo | null
  similar: ReelTitle[]
}) {
  const router = useRouter()
  const { isEpWatched, toggleEpWatched, isFavorite, toggleFavorite } = useMedia()
  const selection = usePlaybackSelection(media)

  // The season/episode still prove the episode exists even when the rich fetch fails.
  const season = detail.seasonList?.find(s => s.id === seasonId)
  const epBasic = season?.episodes.find(e => e.id === episodeId)
  const [playing, setPlaying] = useState(false)

  if (!season || !epBasic) {
    notFound()
  }

  const watched = isEpWatched(episodeId, false)
  const favorite = isFavorite(episodeId, episode?.favorite ?? false)

  // Header values: episode-level when the rich fetch succeeded, else the season-list basics.
  const title = episode?.title ?? epBasic.name
  const overview = episode?.synopsis ?? epBasic.overview
  const heroSrc = episode?.backdropUrl ?? epBasic.imageUrl ?? detail.backdropUrl
  const heroHue = episode?.hue ?? epBasic.hue
  const runtime = episode?.runtime ?? epBasic.runtime
  const cert = episode?.cert ?? detail.cert
  const imdb = episode?.imdb ?? detail.imdb
  const rt = episode?.rt
  const seasonIndex = season.index
  const episodeIndex = epBasic.index

  // Episodes frequently omit Genres/Studios/cast/tagline (those live on the series) — fall
  // back to the series so the "movie-like" sections stay populated.
  const merged: ReelDetail = {
    ...detail,
    genres: episode && episode.genres.length ? episode.genres : detail.genres,
    studios: episode && episode.studios.length ? episode.studios : detail.studios,
    cast: episode && episode.cast.length ? episode.cast : detail.cast,
    directors: episode && episode.directors.length ? episode.directors : detail.directors,
    writers: episode && episode.writers.length ? episode.writers : detail.writers,
    tags: episode && episode.tags && episode.tags.length ? episode.tags : detail.tags,
  }

  const others = season.episodes.filter(e => e.id !== episodeId).sort((a, b) => a.index - b.index)
  const playTitle = `${detail.title} · S${seasonIndex} E${episodeIndex}`

  return (
    <div className="relative pb-20">
      <button
        type="button"
        onClick={() => router.back()}
        className="absolute left-4 top-3 z-50 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3.5 py-2 text-sm font-medium text-ink backdrop-blur-xl transition hover:bg-white/10 md:left-[86px]"
      >
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </button>

      {/* Episode still — the hero backdrop */}
      <div className="relative h-[50vh] min-h-[360px] w-full overflow-hidden">
        <div className="absolute inset-0" style={{ animation: 'kenburns 1.1s ease' }}>
          <Poster gradient={backdropFallback(heroHue)} src={heroSrc} alt={title} rounded="rounded-none" className="h-full w-full" />
        </div>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,6,13,0.2), rgba(8,6,13,0.5) 60%, #0a0810)' }} />
      </div>

      {/* The season's poster overlaps the backdrop; the info column is pushed down so the
          title sits at the backdrop's bottom edge — mirrors the movie layout. */}
      <div className="relative -mt-[90px] flex flex-col gap-5 pl-[var(--rail)] pr-[var(--gx)] md:-mt-[200px] md:flex-row md:items-start md:gap-7">
        <div className="w-[150px] shrink-0 md:w-[268px]" style={{ animation: 'posterRise 0.5s ease' }}>
          <div className="aspect-[2/3] w-full">
            <Poster gradient={poster(season.hue)} src={season.posterUrl ?? detail.posterUrl} alt={season.name} rounded="rounded-[16px]" className="h-full w-full shadow-[0_30px_70px_rgba(0,0,0,0.6)]" />
          </div>
        </div>

        <div className="min-w-0 flex-1 md:pt-[120px]">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">
            <Link href={`/media/tv/${detail.id}`} className="hover:text-ink">{detail.title}</Link>
            <span className="text-white/30"> · {season.name}</span>
          </p>
          <h1 className="font-[800] leading-[1.02] tracking-[-0.028em] text-ink" style={{ fontSize: 'clamp(26px, 6vw, 46px)' }}>{title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-white/60">
            <span className="font-semibold text-accent-soft">S{seasonIndex} · E{episodeIndex}</span>
            {runtime && <><span className="text-white/30">·</span><span>{runtime}m</span></>}
            {cert && <><span className="text-white/30">·</span><span>{cert}</span></>}
            {imdb != null && (
              <>
                <span className="text-white/30">·</span>
                <span className="inline-flex items-center gap-1 text-white/80">
                  <StarIcon className="h-4 w-4" style={{ color: 'var(--star)' }} />
                  {imdb.toFixed(1)}
                </span>
              </>
            )}
            {rt != null && (
              <>
                <span className="text-white/30">·</span>
                <span className="inline-flex items-center gap-1 font-semibold" style={{ color: criticColor(rt) }}>
                  <TomatoIcon className="h-4 w-4" />
                  {Math.round(rt)}%
                </span>
              </>
            )}
            {watched && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-ink">
                <CheckIcon className="h-3 w-3" style={{ color: 'var(--accent)' }} /> Watched
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <ActionButton accent label="Play" onClick={() => setPlaying(true)}>
              <PlayIcon className="h-4 w-4" /> Play
            </ActionButton>
            <ActionButton active={favorite} label="Favorite" onClick={() => toggleFavorite(episodeId, episode?.favorite ?? false)}>
              <HeartIcon className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} style={favorite ? { color: 'var(--fav)' } : undefined} />
            </ActionButton>
            <ActionButton active={watched} label="Mark watched" onClick={() => toggleEpWatched(episodeId, false)}>
              <CheckIcon className="h-4 w-4" /> {watched ? 'Watched' : 'Mark watched'}
            </ActionButton>
          </div>

          {/* Version / Audio / Subtitle selection (drives the player) */}
          <PlaybackPicker selection={selection} />
        </div>
      </div>

      {/* Overview */}
      {overview && (
        <section className={`mt-10 md:mt-2 ${BODY_PAD}`}>
          <p className="max-w-[820px] text-[16px] leading-[1.7] text-white/75 [text-wrap:pretty]">{overview}</p>
        </section>
      )}

      <CreditsGrid detail={merged} />

      <TagsRow tags={merged.tags} type="tv" />

      <FileAndRating selection={selection} itemId={episodeId} />

      <CastRow cast={merged.cast} />

      {/* More in this season */}
      {others.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 px-[var(--rail)] pr-[var(--gx)] text-[20px] font-bold text-ink">More in {season.name}</h2>
          <div className="scrollbar-hide -my-3 flex gap-4 overflow-x-auto py-3 pl-[var(--rail)] pr-[var(--gx)]">
            {others.map(e => (
              <Link key={e.id} href={`/media/tv/${detail.id}/season/${season.id}/${e.id}`} className="group flex w-[240px] shrink-0 flex-col gap-2">
                <div className="relative aspect-video w-full overflow-hidden rounded-xl transition-transform duration-200 group-hover:-translate-y-1">
                  <Poster gradient={backdropFallback(e.hue)} src={e.imageUrl} alt={e.name} className="h-full w-full" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink"><span className="text-accent-soft">E{e.index}</span> · {e.name}</p>
                  {e.runtime && <p className="text-[11.5px] text-white/45">{e.runtime}m</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* More like this */}
      {similar.length > 0 && (
        <section className="mt-12">
          <SectionHeader title="More like this" />
          <Row>{similar.filter(t => t.id !== detail.id).map(t => <PosterCard key={t.id} title={t} />)}</Row>
        </section>
      )}

      <AnimatePresence>
        {playing && (
          <JellyfinPlayer
            itemId={episodeId}
            title={playTitle}
            splashUrl={heroSrc ?? detail.backdropUrl}
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
