'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import type { ReelPerson } from './types'
import { avatar, backdropFallback } from './artwork'
import { Poster, PosterCard } from './ReelCards'
import { BackPill } from './BackPill'

/** Bio line-height in px (15px type × 1.7) and how many lines show before "More". */
const BIO_LINE = 25.5
const BIO_LINES = 7
const BIO_COLLAPSED = BIO_LINE * BIO_LINES
const BIO_FADE = `linear-gradient(to bottom, black ${BIO_COLLAPSED - BIO_LINE * 1.5}px, transparent 100%)`

/** The person's biography, clamped to a few lines with an animated More / Less toggle
    when it runs longer. Short bios render in full with no button. */
function Bio({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setOverflows(el.scrollHeight > BIO_COLLAPSED + BIO_LINE / 2)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])

  const collapsed = overflows && !open
  return (
    <div className="mt-5">
      <motion.div
        className="overflow-hidden"
        // Fade the last clamped line out (a mask, so it works over the themed gradient).
        style={collapsed ? { WebkitMaskImage: BIO_FADE, maskImage: BIO_FADE } : undefined}
        initial={false}
        animate={{ height: collapsed ? BIO_COLLAPSED : 'auto' }}
        transition={{ type: 'spring', bounce: 0, duration: 0.45 }}
      >
        <p ref={ref} className="text-[15px] leading-[1.7] text-white/70 [text-wrap:pretty]">{text}</p>
      </motion.div>
      {overflows && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="mt-2 text-[13px] font-semibold text-accent-soft transition hover:text-ink"
        >
          {open ? 'Less' : 'More'}
        </button>
      )}
    </div>
  )
}

export function PersonDetail({ person }: { person: ReelPerson }) {
  return (
    <div className="relative pb-20">
      <BackPill fallbackHref="/media" />

      {/* Header: portrait on the left, name + bio beside it (stacked on phones). */}
      <div className="pl-[var(--rail)] pr-[var(--gx)] pt-20">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
          <div className="w-[150px] shrink-0 md:w-[220px]">
            <div className="aspect-[3/4] w-full">
              <Poster gradient={avatar(person.hue)} src={person.imageUrl} width={400} height={533} priority alt={person.name} rounded="rounded-2xl" className="h-full w-full shadow-[0_24px_60px_rgba(0,0,0,0.55)]" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">Cast &amp; crew</p>
            <h1 className="mt-2 text-[clamp(30px,7vw,52px)] font-[800] leading-[1] tracking-[-0.025em] text-ink">{person.name}</h1>
            {person.overview && <Bio text={person.overview} />}
          </div>
        </div>
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
