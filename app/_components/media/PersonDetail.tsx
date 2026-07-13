'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ReelPerson } from './types'
import { avatar, backdropFallback } from './artwork'
import { Poster, PosterCard } from './ReelCards'
import { ChevronLeftIcon } from './icons'

export function PersonDetail({ person }: { person: ReelPerson }) {
  const router = useRouter()
  return (
    <div className="relative pb-20">
      <button
        type="button"
        onClick={() => router.back()}
        className="absolute left-4 top-3 z-50 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3.5 py-2 text-sm font-medium text-ink backdrop-blur-xl transition hover:bg-white/10 md:left-[86px]"
      >
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </button>

      {/* Header */}
      <div className="pl-[var(--rail)] pr-[var(--gx)] pt-20">
        <div className="flex flex-col gap-6 md:flex-row md:items-end">
          <div className="w-[150px] shrink-0 md:w-[200px]">
            <div className="aspect-[3/4] w-full">
              <Poster gradient={avatar(person.hue)} src={person.imageUrl} alt={person.name} rounded="rounded-2xl" className="h-full w-full shadow-[0_24px_60px_rgba(0,0,0,0.55)]" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">Cast &amp; crew</p>
            <h1 className="mt-2 text-[clamp(30px,7vw,52px)] font-[800] leading-[1] tracking-[-0.025em] text-ink">{person.name}</h1>
          </div>
        </div>

        {/* Bio sits full-width below the row so it pushes content down rather than
            pushing the name up. */}
        {person.overview && (
          <p className="mt-6 max-w-[900px] text-[15px] leading-[1.7] text-white/70 [text-wrap:pretty]">{person.overview}</p>
        )}
      </div>

      {/* Movies & shows */}
      {person.filmography.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 pl-[var(--rail)] pr-[var(--gx)] text-[20px] font-bold text-ink">Movies &amp; shows</h2>
          <div className="grid gap-x-5 gap-y-7 pl-[var(--rail)] pr-[var(--gx)]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--grid-min), 1fr))' }}>
            {person.filmography.map(t => <PosterCard key={t.id} title={t} width="w-full" overlays />)}
          </div>
        </section>
      )}

      {/* Episodes */}
      {person.episodes.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 pl-[var(--rail)] pr-[var(--gx)] text-[20px] font-bold text-ink">Episodes</h2>
          <div className="grid gap-x-5 gap-y-6 pl-[var(--rail)] pr-[var(--gx)]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {person.episodes.map(ep => (
              <Link key={ep.id} href={`/media/tv/${ep.seriesId}/season/${ep.seasonId}/${ep.id}`} className="group flex flex-col gap-2">
                <div className="relative aspect-video w-full overflow-hidden rounded-xl shadow-[0_16px_34px_rgba(0,0,0,0.5)] transition-transform duration-200 group-hover:-translate-y-1">
                  <Poster gradient={backdropFallback(ep.hue)} src={ep.imageUrl} alt={ep.name} className="h-full w-full" />
                  <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10 transition group-hover:ring-white/20" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{ep.seriesName}</p>
                  <p className="truncate text-[11.5px] text-white/45">S{ep.seasonIndex} · E{ep.episodeIndex} · {ep.name}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {person.filmography.length === 0 && person.episodes.length === 0 && (
        <p className="mt-10 pl-[var(--rail)] pr-[var(--gx)] text-sm text-white/45">Nothing else with {person.name} in your library.</p>
      )}
    </div>
  )
}
