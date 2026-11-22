'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import type { ReelTitle } from './types'
import { BACKDROP_WIDTHS, imageSrcSet } from './artwork'
import { Poster, detailHref } from './ReelCards'
import { PlayIcon, StarIcon } from './icons'

const ROTATE_MS = 7000

function meta(t: ReelTitle): string {
  const bits: string[] = []
  if (t.year) bits.push(String(t.year))
  if (t.type === 'movie' && t.runtime) bits.push(`${Math.floor(t.runtime / 60)}h ${t.runtime % 60}m`)
  if (t.type === 'tv' && t.seasons) bits.push(`${t.seasons} Season${t.seasons > 1 ? 's' : ''}`)
  if (t.genres.length) bits.push(t.genres.slice(0, 2).join(', '))
  return bits.join(' · ')
}

/**
 * Centered progress dots. The active dot is a pill whose accent fill is a live
 * timer (RAF-driven so it freezes on hover); reaching 100% advances the slide.
 */
function HeroDots({
  count, index, paused, onSelect, onComplete,
}: { count: number; index: number; paused: boolean; onSelect: (i: number) => void; onComplete: () => void }) {
  const fillRef = useRef<HTMLSpanElement | null>(null)
  const progressRef = useRef(0)

  // Restart the timer whenever the active slide changes (DOM-only, no re-render).
  useEffect(() => {
    progressRef.current = 0
    if (fillRef.current) fillRef.current.style.width = '0%'
  }, [index])

  // Drive the fill each frame straight to the DOM. Pausing (hover) tears down the
  // loop and freezes progress; resuming picks up where it left off.
  useEffect(() => {
    if (paused) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      progressRef.current = Math.min(1, progressRef.current + (now - last) / ROTATE_MS)
      last = now
      if (fillRef.current) fillRef.current.style.width = `${progressRef.current * 100}%`
      if (progressRef.current >= 1) { onComplete(); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused, index, onComplete])

  return (
    // Centred in the content area (between the sidebar gutter and the right gutter), not
    // the viewport: the hero runs under the glass sidebar, so the viewport's centre reads as off.
    <div className="absolute bottom-5 left-[calc(50%+(var(--rail)-var(--gx))/2)] z-10 flex -translate-x-1/2 items-center gap-2">
      {Array.from({ length: count }).map((_, i) => {
        const active = i === index
        return (
          <motion.button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Show featured item ${i + 1}`}
            aria-current={active}
            initial={false}
            animate={{ width: active ? 40 : 8 }}
            transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
            className="relative h-2 overflow-hidden rounded-full bg-white/25 transition-colors hover:bg-white/45"
          >
            {active && (
              <span
                ref={fillRef}
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
                style={{ width: '0%' }}
              />
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

export function HomeHero({ titles }: { titles: ReelTitle[] }) {
  const count = titles.length
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  // Keep the active index valid if the featured set shrinks between renders.
  const safeIndex = index % count
  const title = titles[safeIndex]

  const go = useCallback((n: number) => setIndex(((n % count) + count) % count), [count])
  const advance = useCallback(() => setIndex(i => (i + 1) % count), [count])

  return (
    <section
      className="relative -mt-px h-[62vh] max-h-[660px] min-h-[420px] w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Cross-fading full-bleed backdrop */}
      <AnimatePresence>
        <motion.div
          key={title.id}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        >
          <Poster gradient={title.backdropColor} src={title.backdropUrl} srcSet={imageSrcSet(title.backdropUrl, BACKDROP_WIDTHS)} sizes="100vw" priority alt={title.title} rounded="rounded-none" className="h-full w-full" />
        </motion.div>
      </AnimatePresence>

      {/* Scrims (static, above the swapping backdrop) */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(8,6,13,0.95), rgba(8,6,13,0.6) 45%, transparent 80%)' }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40" style={{ background: 'linear-gradient(180deg, transparent, #0a0810)' }} />

      {/* Left-weighted content */}
      <div className="relative flex h-full max-w-[calc(var(--rail)+680px)] flex-col justify-end pb-14 pl-[var(--rail)] pr-[var(--gx)]">
        <AnimatePresence mode="wait">
          <motion.div
            key={title.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <p className="mb-3 text-[13px] font-bold text-accent-soft">
              Featured · {title.type === 'tv' ? 'TV Series' : 'Film'}
            </p>
            <h1
              className="line-clamp-3 pb-[0.08em] font-[800] leading-[0.94] tracking-[-0.035em] text-ink [text-wrap:balance]"
              // Long titles step down a size so three lines never outgrow the hero.
              style={{ fontSize: title.title.length > 36 ? 'clamp(30px, 3.6vw, 52px)' : title.title.length > 18 ? 'clamp(34px, 4.6vw, 68px)' : 'clamp(38px, 6.4vw, 92px)' }}
            >
              {title.title}
            </h1>
            <p className="mt-4 flex flex-wrap items-center gap-1.5 text-[15px] text-white/75">
              {title.imdb != null && (
                <span className="inline-flex items-center gap-1 font-semibold text-white">
                  <StarIcon className="h-3.5 w-3.5" style={{ color: 'var(--star)' }} />
                  {title.imdb.toFixed(1)}
                </span>
              )}
              {title.imdb != null && <span className="text-white/30">·</span>}
              <span>{meta(title)}</span>
            </p>
            {title.synopsis && (
              <p className="mt-3 max-w-[560px] text-[15px] leading-[1.6] text-white/75 [text-wrap:pretty] line-clamp-2">
                {title.synopsis}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`${detailHref(title)}?play=1`}
                className="inline-flex h-12 items-center gap-2 rounded-full px-7 text-[15px] font-bold text-ink-on-accent shadow-[0_12px_34px_var(--glow)] transition hover:brightness-[1.06]"
                style={{ background: 'var(--accent)' }}
              >
                <PlayIcon className="h-4 w-4" /> Play
              </Link>
              <Link
                href={detailHref(title)}
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-6 text-[15px] font-bold text-ink backdrop-blur-md transition hover:bg-white/15"
              >
                More info
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Centered timer dots (double as direct slide selectors) */}
      {count > 1 && (
        <HeroDots count={count} index={safeIndex} paused={paused} onSelect={go} onComplete={advance} />
      )}
    </section>
  )
}
