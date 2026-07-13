'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { EpisodeList } from './EpisodeList'
import type { ReelDetail } from './types'
import { Poster } from './ReelCards'
import { ChevronLeftIcon } from './icons'

export function SeasonView({ detail, seasonId }: { detail: ReelDetail; seasonId: string }) {
  const router = useRouter()
  const seasons = detail.seasonList ?? []
  // Switch seasons as client state (no route change) so the header/page don't
  // re-animate. Note: do NOT history.replaceState here — in the App Router that
  // updates usePathname, which remounts this view via PageTransition and resets
  // the selection. The URL just stays on the season the page was opened to.
  const [activeId, setActiveId] = useState(seasonId)
  const season = seasons.find(s => s.id === activeId) ?? seasons[0]

  return (
    <div className="relative pb-20">
      <button
        type="button"
        onClick={() => router.back()}
        className="absolute left-4 top-3 z-50 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3.5 py-2 text-sm font-medium text-ink backdrop-blur-xl transition hover:bg-white/10 md:left-[86px]"
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
      <EpisodeList detail={detail} season={season} />
    </div>
  )
}
