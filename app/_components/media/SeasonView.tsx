'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import JellyfinPlayer from './JellyfinPlayer'
import { useMedia } from './MediaProvider'
import type { ReelDetail } from './types'
import { backdropFallback } from './artwork'
import { Poster } from './ReelCards'
import { PlayIcon, CheckIcon, ChevronLeftIcon } from './icons'

export function SeasonView({ detail, seasonId }: { detail: ReelDetail; seasonId: string }) {
  const router = useRouter()
  const { isEpWatched, toggleEpWatched } = useMedia()
  const seasons = detail.seasonList ?? []
  // Switch seasons as client state (no route change) so the header/page don't
  // re-animate. Note: do NOT history.replaceState here — in the App Router that
  // updates usePathname, which remounts this view via PageTransition and resets
  // the selection. The URL just stays on the season the page was opened to.
  const [activeId, setActiveId] = useState(seasonId)
  const season = seasons.find(s => s.id === activeId) ?? seasons[0]
  const [playing, setPlaying] = useState<{ id: string; title: string } | null>(null)

  const episodes = useMemo(() => [...season.episodes].sort((a, b) => a.index - b.index), [season])
  const nextUnwatchedId = episodes.find(e => !isEpWatched(e.id, false))?.id

  return (
    <div className="pb-20">
      <button
        type="button"
        onClick={() => router.back()}
        className="fixed right-4 top-3 z-50 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3.5 py-2 text-sm font-medium text-ink backdrop-blur-xl transition hover:bg-white/10 md:right-6"
      >
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </button>

      {/* Backdrop header */}
      <div className="relative h-[34vh] min-h-[240px] w-full overflow-hidden">
        <Poster gradient={detail.backdropColor} src={detail.backdropUrl} alt={detail.title} rounded="rounded-none" className="h-full w-full" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,6,13,0.3), rgba(8,6,13,0.6) 60%, #0a0810)' }} />
        <div className="absolute inset-x-0 bottom-0 pl-[var(--rail)] pr-[var(--gx)] pb-5">
          <Link href={`/media/tv/${detail.id}`} className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">{detail.title}</Link>
          <h1 className="mt-1 text-[clamp(28px,6vw,44px)] font-[800] tracking-[-0.02em] text-ink">{season.name}</h1>
        </div>
      </div>

      {/* Season switcher */}
      {seasons.length > 1 && (
        <div className="scrollbar-hide mt-5 flex gap-2 overflow-x-auto pl-[var(--rail)] pr-[var(--gx)]">
          {seasons.map(s => {
            const active = s.id === season.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition ${active ? 'text-ink-on-accent' : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
                style={active ? { background: 'var(--accent)' } : undefined}
              >
                {s.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Episodes */}
      <div className="mt-6 space-y-3 pl-[var(--rail)] pr-[var(--gx)]">
        {episodes.map(e => {
          const watched = isEpWatched(e.id, false)
          const isNext = e.id === nextUnwatchedId
          return (
            <div
              key={e.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/media/tv/${detail.id}/season/${season.id}/${e.id}`)}
              onKeyDown={(ev) => { if (ev.key === 'Enter') router.push(`/media/tv/${detail.id}/season/${season.id}/${e.id}`) }}
              className="group flex cursor-pointer items-center gap-5 rounded-2xl p-2 transition hover:bg-surface"
            >
              <div className="relative aspect-video w-[220px] shrink-0 overflow-hidden rounded-xl sm:w-[340px]">
                <Poster gradient={backdropFallback(e.hue)} src={e.imageUrl} alt={e.name} className="h-full w-full" />
                <button
                  type="button"
                  aria-label="Play episode"
                  onClick={(ev) => { ev.stopPropagation(); setPlaying({ id: e.id, title: `${detail.title} · S${season.index} E${e.index}` }) }}
                  className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm"><PlayIcon className="h-5 w-5" /></span>
                </button>
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
                aria-label={watched ? 'Mark unwatched' : 'Mark watched'}
                onClick={(ev) => { ev.stopPropagation(); toggleEpWatched(e.id, false) }}
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
        {playing && <JellyfinPlayer itemId={playing.id} title={playing.title} onClose={() => setPlaying(null)} />}
      </AnimatePresence>
    </div>
  )
}
