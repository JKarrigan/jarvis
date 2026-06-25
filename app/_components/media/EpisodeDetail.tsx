'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, notFound } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import JellyfinPlayer from './JellyfinPlayer'
import { useMedia } from './MediaProvider'
import { usePlaybackSelection, PlaybackPicker } from './PlaybackPicker'
import type { ReelDetail, MediaInfo } from './types'
import { backdropFallback } from './artwork'
import { Poster } from './ReelCards'
import { PlayIcon, CheckIcon, ChevronLeftIcon } from './icons'

export function EpisodeDetail({
  detail, seasonId, episodeId, media,
}: { detail: ReelDetail; seasonId: string; episodeId: string; media: MediaInfo | null }) {
  const router = useRouter()
  const { isEpWatched, toggleEpWatched } = useMedia()
  const selection = usePlaybackSelection(media)

  const season = detail.seasonList?.find(s => s.id === seasonId)
  const episode = season?.episodes.find(e => e.id === episodeId)
  const [playing, setPlaying] = useState(false)

  if (!season || !episode) {
    notFound()
  }

  const watched = isEpWatched(episode.id, false)
  const others = season.episodes.filter(e => e.id !== episode.id).sort((a, b) => a.index - b.index)
  const playTitle = `${detail.title} · S${season.index} E${episode.index}`

  return (
    <div className="pb-20">
      <button
        type="button"
        onClick={() => router.back()}
        className="fixed right-4 top-3 z-50 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3.5 py-2 text-sm font-medium text-ink backdrop-blur-xl transition hover:bg-white/10 md:right-6"
      >
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </button>

      {/* Episode backdrop */}
      <div className="relative h-[44vh] min-h-[300px] w-full overflow-hidden">
        <div className="absolute inset-0" style={{ animation: 'kenburns 1.1s ease' }}>
          <Poster gradient={backdropFallback(episode.hue)} src={episode.imageUrl} alt={episode.name} rounded="rounded-none" className="h-full w-full" />
        </div>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,6,13,0.2), rgba(8,6,13,0.55) 60%, #0a0810)' }} />
      </div>

      <div className="-mt-24 px-[var(--rail)] pr-[var(--gx)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">
          <Link href={`/media/tv/${detail.id}`} className="hover:text-ink">{detail.title}</Link>
          <span className="text-white/30"> · {season.name}</span>
        </p>
        <h1 className="mt-2 text-[clamp(26px,5.5vw,44px)] font-[800] leading-[1.05] tracking-[-0.02em] text-ink">{episode.name}</h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-white/60">
          <span className="font-semibold text-accent-soft">S{season.index} · E{episode.index}</span>
          {episode.runtime && <><span className="text-white/30">·</span><span>{episode.runtime}m</span></>}
          {watched && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-ink">
              <CheckIcon className="h-3 w-3" style={{ color: 'var(--accent)' }} /> Watched
            </span>
          )}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-ink-on-accent shadow-[0_10px_30px_var(--glow)] transition hover:brightness-[1.06]"
            style={{ background: 'var(--accent)' }}
          >
            <PlayIcon className="h-4 w-4" /> Play
          </button>
          <button
            type="button"
            onClick={() => toggleEpWatched(episode.id, false)}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-ink backdrop-blur-md transition hover:bg-white/10"
            style={watched ? { color: 'var(--accent)' } : undefined}
          >
            <CheckIcon className="h-4 w-4" /> {watched ? 'Watched' : 'Mark watched'}
          </button>
        </div>

        {/* Version / Audio / Subtitle selection (drives the player) */}
        <PlaybackPicker selection={selection} />

        {episode.overview && (
          <p className="mt-6 max-w-[820px] text-[16px] leading-[1.7] text-white/75 [text-wrap:pretty]">{episode.overview}</p>
        )}
      </div>

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

      <AnimatePresence>
        {playing && (
          <JellyfinPlayer
            itemId={episode.id}
            title={playTitle}
            splashUrl={episode.imageUrl ?? detail.backdropUrl}
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
