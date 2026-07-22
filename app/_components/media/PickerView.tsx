'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { useMedia } from './MediaProvider'
import type { ReelTitle } from './types'
import {
  allGenres, pickerPool, shuffle,
  type PickerType, type PickerMood, type PickerSort, type PickerMatch, type UserView,
} from './selectors'
import { AmbientClip } from './AmbientClip'
import { Poster, detailHref } from './ReelCards'
import { StarIcon, ThumbUpIcon, ThumbDownIcon, PlayIcon } from './icons'

const TYPES: { v: PickerType; label: string }[] = [
  { v: 'all', label: 'Everything' }, { v: 'movie', label: 'Movies' }, { v: 'tv', label: 'TV Shows' },
]
const MOODS: { v: PickerMood; label: string }[] = [
  { v: 'crowd', label: 'Crowd-pleasers' }, { v: 'hidden', label: 'Hidden gems' },
  { v: 'quick', label: 'Quick watch' }, { v: 'epic', label: 'Go epic' },
]

/** Toggle a value in/out of a multi-select array. */
function toggleIn<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
}
const SORTS: { v: PickerSort; label: string }[] = [
  { v: 'shuffle', label: 'Shuffle' }, { v: 'top', label: 'Top rated' }, { v: 'newest', label: 'Newest' }, { v: 'shortest', label: 'Shortest' },
]

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${active ? 'text-ink-on-accent' : 'bg-white/[0.06] text-white/75 hover:bg-white/10'}`}
      style={active ? { background: 'var(--accent)' } : undefined}
    >
      {children}
    </button>
  )
}

function metaLine(t: ReelTitle): string {
  const bits: string[] = []
  if (t.year) bits.push(String(t.year))
  if (t.type === 'movie' && t.runtime) bits.push(`${Math.floor(t.runtime / 60)}h ${t.runtime % 60}m`)
  if (t.type === 'tv' && t.seasons) bits.push(`${t.seasons} Season${t.seasons > 1 ? 's' : ''}`)
  if (t.genres.length) bits.push(t.genres.slice(0, 2).join(', '))
  return bits.join(' · ')
}

const CONFETTI_COLORS = ['#e0a872', '#f0c25a', '#7fd8a8', '#8ea6ff', '#f06a8a', '#f3eff8']

/** Deterministic 0–1 pseudo-random (pure — safe during render). */
function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function Confetti() {
  const pieces = useMemo(() =>
    Array.from({ length: 46 }, (_, i) => ({
      left: rnd(i) * 100,
      w: 6 + rnd(i + 50) * 6,
      h: 9 + rnd(i + 100) * 9,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: rnd(i + 150) * 0.6,
      dur: 2.4 + rnd(i + 200) * 2,
    })), [])
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0"
          style={{
            left: `${p.left}%`, width: p.w, height: p.h, background: p.color,
            animation: `confettiFall ${p.dur}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

export function PickerView({ catalog, startFromList = false }: { catalog: ReelTitle[]; startFromList?: boolean }) {
  const router = useRouter()
  const { pickList, isWatched, isFavorite } = useMedia()
  const view: UserView = useMemo(() => ({
    watched: (t) => isWatched(t.id, t.watched),
    favorite: (t) => isFavorite(t.id, t.favorite),
  }), [isWatched, isFavorite])

  const [type, setType] = useState<PickerType>('all')
  const [genres, setGenres] = useState<string[]>([])
  const [moods, setMoods] = useState<PickerMood[]>([])
  const [match, setMatch] = useState<PickerMatch>('any')
  const [sort, setSort] = useState<PickerSort>('shuffle')
  const [hideWatched, setHideWatched] = useState(false)
  // One-way flag: the first touch of a pool-affecting control splits the setup
  // layout (form left, live deck preview right) for the rest of the session.
  const [touched, setTouched] = useState(false)

  const [stage, setStage] = useState<'setup' | 'swipe'>('setup')
  const [pool, setPool] = useState<ReelTitle[]>([])
  const [idx, setIdx] = useState(0)
  const [kept, setKept] = useState<ReelTitle[]>([])
  const [exitDir, setExitDir] = useState<'keep' | 'pass' | null>(null)

  const genreList = useMemo(() => allGenres(catalog), [catalog])
  // Live preview of the deck — deterministic sort so render stays pure (sort doesn't
  // change membership; the real deck order is applied in startPicking).
  const previewPool = useMemo(
    () => pickerPool(catalog, { type, genres, moods, match, sort: 'top', hideWatched }, view),
    [catalog, type, genres, moods, match, hideWatched, view],
  )
  const deckCount = previewPool.length
  const examples = previewPool.slice(0, 6)

  // Entry from the picker list ("Start the roundup"). Re-runs as pickList hydrates
  // from localStorage; the ref guard makes it a one-time initialization.
  const startedRef = useRef(false)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!startFromList || startedRef.current) return
    const byId = new Map(catalog.map(t => [t.id, t]))
    const start = pickList.map(id => byId.get(id)).filter((t): t is ReelTitle => Boolean(t))
    if (start.length) { startedRef.current = true; setPool(shuffle(start)); setStage('swipe') }
  }, [startFromList, pickList, catalog])
  /* eslint-enable react-hooks/set-state-in-effect */

  const startPicking = () => {
    setPool(pickerPool(catalog, { type, genres, moods, match, sort, hideWatched }, view))
    setIdx(0); setKept([]); setStage('swipe')
  }

  const current = pool[idx]
  const done = stage === 'swipe' && idx >= pool.length

  const vote = useCallback((keep: boolean) => {
    setKept(k => (keep && pool[idx] ? [...k, pool[idx]] : k))
    setExitDir(keep ? 'keep' : 'pass')
    setIdx(i => i + 1)
  }, [pool, idx])

  useEffect(() => {
    if (stage !== 'swipe' || done) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') vote(true)
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') vote(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage, done, vote])

  const anotherRound = () => { setPool(shuffle(kept)); setIdx(0); setKept([]) }
  const newPicker = () => { setStage('setup'); setPool([]); setIdx(0); setKept([]) }

  // ---- Setup ----
  if (stage === 'setup') {
    return (
      <div className="mx-auto flex w-full max-w-[1280px] items-start gap-10 px-[var(--rail)] py-16 md:px-[var(--gx)]">
        <motion.div
          layout
          transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
          className={touched ? 'min-w-0 flex-1' : 'mx-auto w-full max-w-[880px]'}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">Movie picker</p>
          <h1 className="mt-2 text-[clamp(32px,7vw,56px)] font-[800] leading-[1.02] tracking-[-0.025em] text-ink">Can&rsquo;t decide?<br />Let&rsquo;s narrow it down.</h1>
          <p className="mt-4 max-w-[560px] text-[15px] leading-[1.6] text-white/60">
            Pick a couple of filters, then thumbs-up or thumbs-down each title. Run as many rounds as you like until you&rsquo;re down to tonight&rsquo;s movie.
          </p>

          <Group label="Show me">{TYPES.map(t => <Chip key={t.v} active={type === t.v} onClick={() => { setType(t.v); setTouched(true) }}>{t.label}</Chip>)}</Group>
          <Group label="Genre">
            <Chip active={genres.length === 0} onClick={() => { setGenres([]); setTouched(true) }}>Any genre</Chip>
            {genreList.map(g => <Chip key={g} active={genres.includes(g)} onClick={() => { setGenres(a => toggleIn(a, g)); setTouched(true) }}>{g}</Chip>)}
          </Group>
          <Group label="In the mood for">
            <Chip active={moods.length === 0} onClick={() => { setMoods([]); setTouched(true) }}>Anything</Chip>
            {MOODS.map(m => <Chip key={m.v} active={moods.includes(m.v)} onClick={() => { setMoods(a => toggleIn(a, m.v)); setTouched(true) }}>{m.label}</Chip>)}
          </Group>

          {/* Only meaningful once a facet has 2+ selections to combine */}
          <AnimatePresence initial={false}>
            {(genres.length > 1 || moods.length > 1) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
                className="overflow-hidden"
              >
                <Group label="Combine picks">
                  <Chip active={match === 'any'} onClick={() => setMatch('any')}>Match any &mdash; this or that</Chip>
                  <Chip active={match === 'all'} onClick={() => setMatch('all')}>Match all &mdash; this and that</Chip>
                </Group>
              </motion.div>
            )}
          </AnimatePresence>

          <Group label="Order the deck">{SORTS.map(s => <Chip key={s.v} active={sort === s.v} onClick={() => setSort(s.v)}>{s.label}</Chip>)}</Group>

          <button
            type="button"
            onClick={() => { setHideWatched(v => !v); setTouched(true) }}
            className="mt-6 flex items-center gap-2.5 rounded-full bg-white/[0.06] px-4 py-2.5 text-sm text-white/80 transition hover:bg-white/10"
          >
            <span className="grid h-5 w-5 place-items-center rounded-md border" style={hideWatched ? { background: 'var(--accent)', borderColor: 'transparent' } : { borderColor: 'rgba(255,255,255,0.25)' }}>
              {hideWatched && <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="var(--ink-on-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 10.5 8 14l7.5-8" /></svg>}
            </span>
            Hide movies I&rsquo;ve already watched
          </button>

          <div className="mt-8 flex items-center gap-4">
            <button
              type="button"
              onClick={startPicking}
              disabled={deckCount === 0}
              className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-[15px] font-semibold text-ink-on-accent shadow-[0_12px_34px_var(--glow)] transition hover:brightness-[1.06] disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              Start picking <span aria-hidden>›</span>
            </button>
            <span className="text-sm text-white/45">{deckCount} title{deckCount === 1 ? '' : 's'} in the deck</span>
          </div>
        </motion.div>

        <AnimatePresence>
          {touched && (
            <motion.aside
              layout
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 28 }}
              transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
              className="sticky top-16 hidden w-[320px] shrink-0 md:block"
            >
              <DeckPreview titles={examples} total={deckCount} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ---- Winner ----
  if (done && kept.length === 1) {
    const w = kept[0]
    return (
      <div className="relative min-h-[80vh]">
        <Confetti />
        <div className="relative z-10 mx-auto max-w-[880px] px-[var(--rail)] py-20 md:px-[var(--gx)]" style={{ animation: 'winnerPop 0.6s ease' }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">★ Tonight&rsquo;s pick</p>
          <h1 className="mt-2 text-[clamp(40px,10vw,72px)] font-[800] leading-[0.98] tracking-[-0.025em] text-ink">{w.title}</h1>
          <p className="mt-3 text-white/65">{metaLine(w)}</p>
          {w.synopsis && <p className="mt-4 max-w-[620px] text-[15px] leading-[1.6] text-white/70">{w.synopsis}</p>}
          <div className="mt-7 flex flex-wrap gap-3">
            <button type="button" onClick={() => router.push(`${detailHref(w)}?play=1`)} className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-ink-on-accent shadow-[0_12px_34px_var(--glow)]" style={{ background: 'var(--accent)' }}><PlayIcon className="h-4 w-4" /> Play now</button>
            <button type="button" onClick={() => router.push(detailHref(w))} className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-white/10">View details</button>
            <button type="button" onClick={newPicker} className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-white/10">Pick again</button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Results / shortlist ----
  if (done) {
    return (
      <div className="mx-auto max-w-[1000px] px-[var(--rail)] py-16 md:px-[var(--gx)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">Shortlist</p>
        <h1 className="mt-2 text-[clamp(30px,6vw,46px)] font-[800] tracking-[-0.02em] text-ink">{kept.length ? `${kept.length} kept` : 'Nothing kept'}</h1>
        {kept.length > 0 ? (
          <>
            <div className="mt-7 grid gap-x-5 gap-y-7" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--grid-min), 1fr))' }}>
              {kept.map(t => (
                <button key={t.id} type="button" onClick={() => router.push(detailHref(t))} className="group text-left">
                  <div className="aspect-[2/3] w-full"><Poster gradient={t.posterColor} src={t.posterUrl} alt={t.title} className="h-full w-full" /></div>
                  <p className="mt-2 truncate text-[13.5px] font-semibold text-ink">{t.title}</p>
                </button>
              ))}
            </div>
            <div className="mt-8 flex gap-3">
              {kept.length > 1 && <button type="button" onClick={anotherRound} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-ink-on-accent" style={{ background: 'var(--accent)' }}>Another round</button>}
              <button type="button" onClick={newPicker} className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-white/10">New picker</button>
            </div>
          </>
        ) : (
          <button type="button" onClick={newPicker} className="mt-6 rounded-xl px-5 py-2.5 text-sm font-semibold text-ink-on-accent" style={{ background: 'var(--accent)' }}>New picker</button>
        )}
      </div>
    )
  }

  // ---- Swipe ----
  return (
    <div className="relative min-h-svh w-full overflow-hidden">
      {current && (
        <div className="absolute inset-0">
          <Poster gradient={current.backdropColor} src={current.backdropUrl} alt={current.title} rounded="rounded-none" className="h-full w-full" />
          {/* Movies only — picker TV titles are series ids with no playable MediaSources */}
          {current.type === 'movie' && <AmbientClip key={current.id} itemId={current.id} />}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(90% 90% at 50% 55%, rgba(8,6,13,0.7), rgba(8,6,13,0.45) 60%, rgba(8,6,13,0.3)), linear-gradient(180deg, rgba(8,6,13,0.35), rgba(8,6,13,0.55))' }} />
        </div>
      )}

      {/* progress */}
      <div className="absolute inset-x-0 top-5 z-20 flex flex-col items-center gap-1 text-sm">
        <span className="rounded-full bg-black/45 px-3 py-1 font-semibold text-white backdrop-blur-sm">{Math.min(idx + 1, pool.length)} / {pool.length}</span>
        <span className="text-white/60">♥ {kept.length} kept</span>
      </div>

      <div className="relative z-10 flex min-h-svh items-center justify-center">
        {/* wait: the outgoing card fully animates out before the next one rises in. */}
        <AnimatePresence mode="wait" custom={exitDir} onExitComplete={() => setExitDir(null)}>
          {current && (
            <motion.div
              key={idx}
              custom={exitDir}
              drag="x"
              dragSnapToOrigin
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => { if (info.offset.x > 60) vote(true); else if (info.offset.x < -60) vote(false) }}
              variants={{
                initial: { opacity: 0, y: 28, scale: 0.985 },
                animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.44, ease: [0.2, 0.7, 0.2, 1] } },
                exit: (dir: 'keep' | 'pass' | null) => ({ opacity: 0, x: dir === 'keep' ? 140 : -140, rotate: dir === 'keep' ? 3 : -3, transition: { duration: 0.27 } }),
              }}
              initial="initial" animate="animate" exit="exit"
              className="w-full max-w-[880px] cursor-grab px-[var(--rail)] text-center active:cursor-grabbing md:px-[var(--gx)]"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">{current.type === 'tv' ? 'TV Series' : 'Film'}</p>
              <h1 className="mt-2 font-[800] leading-[0.98] tracking-[-0.025em] text-ink" style={{ fontSize: 'clamp(36px, 9vw, 62px)' }}>{current.title}</h1>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-white/70">
                {current.imdb != null && <span className="inline-flex items-center gap-1 font-semibold text-white"><StarIcon className="h-4 w-4" style={{ color: 'var(--star)' }} />{current.imdb.toFixed(1)}</span>}
                <span>{metaLine(current)}</span>
              </p>
              {current.synopsis && <p className="mx-auto mt-4 max-w-[600px] text-[15px] leading-[1.6] text-white/70 [text-wrap:pretty] line-clamp-4">{current.synopsis}</p>}

              <div className="mt-8 flex items-center justify-center gap-4">
                <button type="button" onClick={() => vote(false)} aria-label="Pass" className="grid h-16 w-16 place-items-center rounded-full border border-white/15 bg-black/40 backdrop-blur-md transition hover:scale-105" style={{ color: 'var(--pass)' }}>
                  <ThumbDownIcon className="h-6 w-6" />
                </button>
                <button type="button" onClick={() => vote(true)} aria-label="Keep" className="grid h-16 w-16 place-items-center rounded-full text-ink-on-accent shadow-[0_12px_34px_var(--glow)] transition hover:scale-105" style={{ background: 'var(--accent)' }}>
                  <ThumbUpIcon className="h-6 w-6" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Live sample of the filtered deck shown beside the setup form. */
function DeckPreview({ titles, total }: { titles: ReelTitle[]; total: number }) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">In your deck · {total}</p>
      {total === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/50">Nothing matches — loosen a filter.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <AnimatePresence mode="popLayout">
            {titles.map(t => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.25 }}
              >
                <div className="aspect-[2/3]"><Poster gradient={t.posterColor} src={t.posterUrl} alt={t.title} className="h-full w-full" /></div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      {total > 6 && <p className="mt-3 text-sm text-white/45">+{total - 6} more in the deck</p>}
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-7">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">{label}</p>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </div>
  )
}
