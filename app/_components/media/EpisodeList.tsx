'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import { useTitleState } from './MediaProvider'
import type { ReelDetail, ReelSeasonInfo } from './types'
import { backdropFallback, imageSrcSet } from './artwork'
import { HOVER_REVEAL, Poster } from './ReelCards'
import { PlayIcon, CheckIcon } from './icons'

const JellyfinPlayer = dynamic(() => import('./JellyfinPlayer'), { ssr: false })

/** Vertical list of a season's episodes — thumbnail + metadata rows that navigate to the
    episode page, with a hover play-overlay that opens the player inline. Owns its own player
    so it can be embedded on both the season page and (single-season) the show detail page. */
export function EpisodeList({ detail, season }: { detail: ReelDetail; season: ReelSeasonInfo }) {
  const router = useRouter()
  const { isEpWatched, toggleEpWatched } = useTitleState()
  const [playing, setPlaying] = useState<{ id: string; title: string } | null>(null)

  const episodes = useMemo(() => [...season.episodes].sort((a, b) => a.index - b.index), [season])
  const nextUnwatchedId = episodes.find(e => !isEpWatched(e.id, e.played ?? false))?.id

  return (
    <>
      <div className="mt-6 space-y-3 pl-[var(--rail)] pr-[var(--gx)]">
        {episodes.map(e => {
          const watched = isEpWatched(e.id, e.played ?? false)
          const partial = !watched && (e.progress ?? 0) > 0 && (e.progress ?? 0) < 1
          const isNext = e.id === nextUnwatchedId
          const href = `/media/tv/${detail.id}/season/${season.id}/${e.id}`
          return (
            <div
              key={e.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(href)}
              onKeyDown={(ev) => { if (ev.key === 'Enter') router.push(href) }}
              className="group flex cursor-pointer items-center gap-5 rounded-2xl p-2 transition hover:bg-surface"
            >
              <div className="relative aspect-video w-[220px] shrink-0 overflow-hidden rounded-xl sm:w-[340px]">
                <Poster
                  gradient={backdropFallback(e.hue)}
                  src={e.imageUrl}
                  srcSet={imageSrcSet(e.imageUrl, [480, 720, 960])}
                  sizes="(min-width: 640px) 340px, 220px"
                  alt={e.name}
                  className="h-full w-full"
                />
                <button
                  type="button"
                  aria-label={`Play episode ${e.index}: ${e.name}`}
                  onClick={(ev) => { ev.stopPropagation(); setPlaying({ id: e.id, title: `${detail.title} · S${season.index} E${e.index}` }) }}
                  className={`absolute inset-0 grid place-items-center bg-black/30 transition-opacity duration-200 ${HOVER_REVEAL}`}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm"><PlayIcon className="h-5 w-5" /></span>
                </button>
                {partial && (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                    <div className="h-full" style={{ width: `${(e.progress ?? 0) * 100}%`, background: 'var(--accent)' }} />
                  </div>
                )}
                {isNext && (
                  <span className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-on-accent" style={{ background: 'var(--accent)' }}>Up next</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-accent-soft">E{e.index}</span>
                  <p className="truncate font-semibold text-ink">{e.name}</p>
                </div>
                {e.runtime && <p className="mt-0.5 text-xs text-white/45">{e.runtime}m</p>}
                {e.overview && <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-white/55 [text-wrap:pretty]">{e.overview}</p>}
              </div>

              <button
                type="button"
                aria-label={watched ? `Mark episode ${e.index} unwatched` : `Mark episode ${e.index} watched`}
                aria-pressed={watched}
                onClick={(ev) => { ev.stopPropagation(); toggleEpWatched(e.id, e.played ?? false) }}
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

      <AnimatePresence>
        {playing && (
          <JellyfinPlayer
            itemId={playing.id}
            title={playing.title}
            // Refresh so resume progress / watched state reflect what was just watched.
            onClose={() => { setPlaying(null); router.refresh() }}
          />
        )}
      </AnimatePresence>
    </>
  )
}
