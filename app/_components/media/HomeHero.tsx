'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import type { ReelTitle } from './types'
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
    <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
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
      className="relative -mt-px h-[80vh] min-h-[420px] w-full overflow-hidden"
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
          <Poster gradient={title.backdropColor} src={title.backdropUrl} alt={title.title} rounded="rounded-none" className="h-full w-full" />
        </motion.div>
      </AnimatePresence>

      {/* Scrims (static, above the swapping backdrop) */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(8,6,13,0.95), rgba(8,6,13,0.6) 45%, transparent 80%)' }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40" style={{ background: 'linear-gradient(180deg, transparent, #0a0810)' }} />

      {/* Left-weighted content */}
      <div className="relative flex h-full max-w-[640px] flex-col justify-end pb-10 pl-[var(--rail)] pr-[var(--gx)]">
        <AnimatePresence mode="wait">
          <motion.div
            key={title.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">
              Featured · {title.type === 'tv' ? 'TV Series' : 'Film'}
            </p>
            <h1 className="font-[800] leading-[0.98] tracking-[-0.025em] text-ink" style={{ fontSize: 'clamp(30px, 7vw, 54px)' }}>
              {title.title}
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-white/70">
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
              <p className="mt-4 max-w-[620px] text-[15px] leading-[1.6] text-white/70 [text-wrap:pretty] line-clamp-3">
                {title.synopsis}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`${detailHref(title)}?play=1`}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-ink-on-accent shadow-[0_12px_34px_var(--glow)] transition hover:brightness-[1.06]"
                style={{ background: 'var(--accent)' }}
              >
                <PlayIcon className="h-4 w-4" /> Play
              </Link>
              <Link
                href={detailHref(title)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-ink backdrop-blur-md transition hover:bg-white/10"
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
