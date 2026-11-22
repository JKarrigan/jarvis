'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { useMediaProfile, useUserView } from './MediaProvider'
import type { ReelTitle } from './types'
import {
  SORT_DEFAULT_DIR, allGenres, allPeople, allTags, applyShow, creditedAs, effectiveGenres, matchesQuery, sortTitles,
  type LibrarySort, type LibraryShow, type LibraryType, type PersonOption, type SortDir,
} from './selectors'
import {
  LIBRARY_DEFAULTS, parseLibraryQuery, serializeLibraryQuery,
  type GridSize, type LibraryQuery, type LibraryViewMode,
} from './libraryQuery'
import { FilterDropdown } from './FilterDropdown'
import { PosterCard } from './ReelCards'
import { LibraryList } from './LibraryList'
import { Sheet } from './Sheet'
import { useEscape, useIsMobile } from './hooks'
import { SearchIcon, CloseIcon } from './icons'

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: 'added', label: 'Date added' },
  { value: 'title', label: 'Title' },
  { value: 'year', label: 'Year' },
  { value: 'rating', label: 'Rating' },
  { value: 'runtime', label: 'Runtime' },
]

const SHOW_OPTIONS: { value: LibraryShow; label: string }[] = [
  { value: 'all', label: 'All titles' },
  { value: 'unwatched', label: 'Unwatched' },
  { value: 'watched', label: 'Watched' },
  { value: 'favorites', label: 'Favorites' },
]

const TYPE_OPTIONS: { value: LibraryType; label: string }[] = [
  { value: 'all', label: 'Movies & shows' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV shows' },
]

/** Typing waits this long before it is written to the URL (Safari rate-limits replaceState). */
const URL_TEXT_DELAY_MS = 300

export type LibraryBase = 'movie' | 'tv' | 'favorites'

interface FilterChip {
  key: string
  label: string
  remove: () => void
}

/**
 * Library state for one page: filters, sort and view, seeded from the URL and mirrored
 * back to it, so opening a title and coming Back (or sharing the link) restores the same
 * list. View and poster size are profile preferences; `view` only enters the URL once
 * List is chosen, so a restored page shows it without waiting for the profile to load.
 */
export function useFilteredLibrary(catalog: ReelTitle[], base?: LibraryBase) {
  const view = useUserView()
  const searchParams = useSearchParams()
  const { libraryView, setLibraryView, gridSize, setGridSize } = useMediaProfile()
  const [state, setState] = useState<LibraryQuery>(() => parseLibraryQuery(new URLSearchParams(searchParams.toString())))

  // The route decides the starting pool; every other facet narrows it.
  const scoped = useMemo(() => {
    if (base === 'movie') return catalog.filter(t => t.type === 'movie')
    if (base === 'tv') return catalog.filter(t => t.type === 'tv')
    if (base === 'favorites') return catalog.filter(t => view.favorite(t))
    return catalog
  }, [catalog, base, view])

  const genres = useMemo(() => allGenres(catalog), [catalog])
  const tags = useMemo(() => allTags(catalog), [catalog])
  const directors = useMemo(() => allPeople(scoped, 'director'), [scoped])
  const actors = useMemo(() => allPeople(scoped, 'actor'), [scoped])
  const typeFilterable = base !== 'movie' && base !== 'tv'

  // A value the library doesn't have (stale link, renamed tag) counts as "any", not as zero results.
  const genre = genres.includes(state.genre) ? state.genre : 'any'
  const tag = tags.includes(state.tag) ? state.tag : 'any'
  const director = directors.some(p => p.id === state.director) ? state.director : 'any'
  const actor = actors.some(p => p.id === state.actor) ? state.actor : 'any'
  const type = typeFilterable ? state.type : 'all'
  const { sort, dir, show, q: query } = state

  const result = useMemo(() => {
    let list = scoped
    if (type !== 'all') list = list.filter(t => t.type === type)
    if (genre !== 'any') list = list.filter(t => effectiveGenres(t).includes(genre))
    if (tag !== 'any') list = list.filter(t => t.tags?.includes(tag))
    if (director !== 'any') list = list.filter(t => creditedAs(t, director, 'director'))
    if (actor !== 'any') list = list.filter(t => creditedAs(t, actor, 'actor'))
    const needle = query.trim().toLowerCase()
    if (needle) list = list.filter(t => matchesQuery(t, needle))
    list = applyShow(list, show, view)
    return sortTitles(list, sort, dir)
  }, [scoped, type, genre, tag, director, actor, query, show, sort, dir, view])

  // Mirror to the URL. replaceState gets a fresh object every time: handing history.state
  // back makes Next skip its useSearchParams sync (see the Photos notes in CLAUDE.md).
  const mounted = useRef(false)
  const lastText = useRef(state.q)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    const write = () => {
      const qs = serializeLibraryQuery(state)
      if (qs !== window.location.search) window.history.replaceState({}, '', `${window.location.pathname}${qs}${window.location.hash}`)
    }
    if (lastText.current === state.q) { write(); return }
    lastText.current = state.q
    const timer = setTimeout(write, URL_TEXT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [state])

  const patch = useCallback((p: Partial<LibraryQuery>) => setState(s => ({ ...s, ...p })), [])

  /** Picking the active sort again reverses it; a new sort starts in its natural direction. */
  const chooseSort = useCallback((next: LibrarySort) => {
    setState(s => s.sort === next
      ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { ...s, sort: next, dir: SORT_DEFAULT_DIR[next] })
  }, [])
  const flipDir = useCallback(() => setState(s => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' })), [])

  const viewMode: LibraryViewMode = state.view ?? libraryView
  const setView = useCallback((v: LibraryViewMode) => {
    setLibraryView(v)
    setState(s => ({ ...s, view: v === 'list' ? 'list' : undefined }))
  }, [setLibraryView])

  const reset = useCallback(() => setState(s => ({ ...LIBRARY_DEFAULTS, view: s.view })), [])

  const chips: FilterChip[] = []
  if (query.trim()) chips.push({ key: 'q', label: `Search: ${query.trim()}`, remove: () => patch({ q: '' }) })
  if (type !== 'all') chips.push({ key: 'type', label: TYPE_OPTIONS.find(o => o.value === type)?.label ?? type, remove: () => patch({ type: 'all' }) })
  if (genre !== 'any') chips.push({ key: 'genre', label: `Genre: ${genre}`, remove: () => patch({ genre: 'any' }) })
  if (tag !== 'any') chips.push({ key: 'tag', label: `Tag: ${tag}`, remove: () => patch({ tag: 'any' }) })
  if (director !== 'any') chips.push({ key: 'director', label: `Director: ${directors.find(p => p.id === director)?.name ?? ''}`, remove: () => patch({ director: 'any' }) })
  if (actor !== 'any') chips.push({ key: 'actor', label: `Actor: ${actors.find(p => p.id === actor)?.name ?? ''}`, remove: () => patch({ actor: 'any' }) })
  if (show !== 'all') chips.push({ key: 'show', label: `Show: ${SHOW_OPTIONS.find(o => o.value === show)?.label ?? show}`, remove: () => patch({ show: 'all' }) })

  return {
    sort, dir, chooseSort, flipDir,
    type, setType: (v: LibraryType) => patch({ type: v }),
    genre, setGenre: (v: string) => patch({ genre: v }),
    tag, setTag: (v: string) => patch({ tag: v }),
    director, setDirector: (v: string) => patch({ director: v }),
    actor, setActor: (v: string) => patch({ actor: v }),
    query, setQuery: (v: string) => patch({ q: v }),
    show, setShow: (v: LibraryShow) => patch({ show: v }),
    genres, tags, directors, actors, result, total: scoped.length, chips, reset,
    /** Anything that changes what the list shows or its order (Home hides its rows while this is on). */
    filtersActive: chips.length > 0 || sort !== LIBRARY_DEFAULTS.sort || dir !== SORT_DEFAULT_DIR[sort],
    /** Type is fixed by the Movies / TV routes, so only the mixed views offer the facet. */
    typeFilterable,
    viewMode, setView, gridSize, setGridSize,
  }
}

export type FilteredLibrary = ReturnType<typeof useFilteredLibrary>

function peopleOptions(people: PersonOption[], anyLabel: string) {
  return [{ value: 'any', label: anyLabel }, ...people.map(p => ({ value: p.id, label: p.name, hint: String(p.count) }))]
}

// ─── Header controls ─────────────────────────────────────────────────────────

const segWrap = 'flex gap-0.5 rounded-xl border border-border bg-white/5 p-1 backdrop-blur-md'
const segBtn = (on: boolean) =>
  `flex h-8 items-center justify-center gap-2 rounded-lg px-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
    on ? 'bg-white/15 font-bold text-white' : 'font-semibold text-white/60 hover:text-white'
  }`

const SIZE_OPTIONS: { value: GridSize; label: string; d: string }[] = [
  { value: 'compact', label: 'Compact posters', d: 'M1 1h3v3H1zM6.5 1h3v3h-3zM12 1h3v3h-3zM1 6.5h3v3H1zM6.5 6.5h3v3h-3zM12 6.5h3v3h-3zM1 12h3v3H1zM6.5 12h3v3h-3zM12 12h3v3h-3z' },
  { value: 'comfortable', label: 'Comfortable posters', d: 'M1 1h6v6H1zM9 1h6v6H9zM1 9h6v6H1zM9 9h6v6H9z' },
  { value: 'large', label: 'Large posters', d: 'M1 1h14v6H1zM1 9h14v6H1z' },
]

/** Poster size (grid only). */
export function GridSizeControl({ value, onChange }: { value: GridSize; onChange: (s: GridSize) => void }) {
  return (
    <div role="group" aria-label="Poster size" className={segWrap}>
      {SIZE_OPTIONS.map(o => (
        // Large and Comfortable are the same two columns on a phone, so Large is left out there.
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-label={o.label} title={o.label} aria-pressed={value === o.value} className={`${segBtn(value === o.value)} ${o.value === 'large' ? 'max-sm:hidden' : ''}`}>
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d={o.d} /></svg>
        </button>
      ))}
    </div>
  )
}

/** Grid / List switch. */
export function ViewControl({ value, onChange }: { value: LibraryViewMode; onChange: (v: LibraryViewMode) => void }) {
  return (
    <div role="group" aria-label="View" className={segWrap}>
      <button type="button" onClick={() => onChange('grid')} aria-pressed={value === 'grid'} aria-label="Grid view" className={segBtn(value === 'grid')}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 1h6v6H1zM9 1h6v6H9zM1 9h6v6H1zM9 9h6v6H9z" /></svg>
        <span className="hidden sm:inline">Grid</span>
      </button>
      <button type="button" onClick={() => onChange('list')} aria-pressed={value === 'list'} aria-label="List view" className={segBtn(value === 'list')}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 3.5h12M2 8h12M2 12.5h12" /></svg>
        <span className="hidden sm:inline">List</span>
      </button>
    </div>
  )
}

function SortControl({ lib }: { lib: FilteredLibrary }) {
  const asc = lib.dir === 'asc'
  return (
    <div className="flex items-center gap-1">
      <FilterDropdown label="Sort" value={lib.sort} onChange={lib.chooseSort} options={SORT_OPTIONS} size="md" />
      <button
        type="button"
        onClick={lib.flipDir}
        aria-label={`Sorted ${asc ? 'ascending' : 'descending'}. Reverse the order`}
        title={asc ? 'Ascending' : 'Descending'}
        className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-white/5 text-accent-soft backdrop-blur-md transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${asc ? 'rotate-180' : ''}`}>
          <path d="M10 4v12M5 11l5 5 5-5" />
        </svg>
      </button>
    </div>
  )
}

// ─── Filter bar ──────────────────────────────────────────────────────────────

/** The less-used facets, behind one button: a popover from md, a sheet on phones. */
function MoreFilters({ lib }: { lib: FilteredLibrary }) {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const ref = useRef<HTMLDivElement>(null)
  const count = [lib.type !== 'all', lib.tag !== 'any', lib.director !== 'any', lib.actor !== 'any'].filter(Boolean).length
  const popover = open && !isMobile

  useEscape(() => setOpen(false), popover)
  useEffect(() => {
    if (!popover) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [popover])

  const field = (label: string, control: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-white/60">{label}</span>
      {control}
    </div>
  )
  const body = (
    <>
      {lib.typeFilterable && field('Type', <FilterDropdown label="Type" value={lib.type} onChange={lib.setType} options={TYPE_OPTIONS} size="md" block active={lib.type !== 'all'} />)}
      {lib.tags.length > 0 && field('Tag', (
        <FilterDropdown
          label="Tag" value={lib.tag} onChange={lib.setTag} size="md" block active={lib.tag !== 'any'}
          options={[{ value: 'any', label: 'All tags' }, ...lib.tags.map(t => ({ value: t, label: t }))]}
          searchable={lib.tags.length > 12}
        />
      ))}
      {lib.directors.length > 0 && field('Director', (
        <FilterDropdown label="Director" value={lib.director} onChange={lib.setDirector} options={peopleOptions(lib.directors, 'Any director')} searchable size="md" block active={lib.director !== 'any'} />
      ))}
      {lib.actors.length > 0 && field('Actor', (
        <FilterDropdown label="Actor" value={lib.actor} onChange={lib.setActor} options={peopleOptions(lib.actors, 'Any actor')} searchable size="md" block active={lib.actor !== 'any'} />
      ))}
    </>
  )

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold text-ink backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          open || count > 0 ? 'border-accent/60 bg-accent/10 hover:bg-accent/15' : 'border-border bg-white/5 hover:bg-white/10'
        }`}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4" /></svg>
        Filters
        {count > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-ink-on-accent">
            {count}<span className="sr-only"> active</span>
          </span>
        )}
      </button>

      <AnimatePresence>
        {popover && (
          <motion.div
            role="dialog"
            aria-label="More filters"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.12, ease: 'easeIn' } }}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.28 }}
            className="absolute left-0 top-full z-40 mt-2 flex w-[320px] flex-col gap-4 rounded-2xl border border-white/10 p-4 shadow-2xl backdrop-blur-xl"
            style={{ background: 'rgba(12,10,14,0.97)' }}
          >
            {body}
          </motion.div>
        )}
        {open && isMobile && (
          <Sheet onClose={() => setOpen(false)} label="More filters">
            {/* Tall enough that a dropdown opened inside it has room without scrolling the sheet. */}
            <div className="flex min-h-[62vh] flex-col gap-4 px-4 pb-6 pt-2">
              <h2 className="text-base font-bold text-zinc-100">Filters</h2>
              {body}
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  )
}

export function LibraryFilterBar({ lib }: { lib: FilteredLibrary }) {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 pl-[var(--rail)] pr-[var(--gx)]">
        <label className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-border bg-white/5 px-3.5 text-sm text-ink backdrop-blur-md transition focus-within:bg-white/10 sm:max-w-[320px]">
          <SearchIcon className="h-4 w-4 shrink-0 text-white/60" aria-hidden="true" />
          <input
            value={lib.query}
            onChange={e => lib.setQuery(e.target.value)}
            aria-label="Filter by title or name"
            placeholder="Filter by title or name"
            className="min-w-0 flex-1 bg-transparent placeholder:text-white/50 focus:outline-none"
          />
          {lib.query && (
            <button type="button" onClick={() => lib.setQuery('')} aria-label="Clear filter text" className="grid h-7 w-7 place-items-center rounded-lg text-white/60 hover:text-white">
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <FilterDropdown
          label="Genre" value={lib.genre} onChange={lib.setGenre} size="md" active={lib.genre !== 'any'}
          options={[{ value: 'any', label: 'All genres' }, ...lib.genres.map(g => ({ value: g, label: g }))]}
        />
        <FilterDropdown label="Show" value={lib.show} onChange={lib.setShow} options={SHOW_OPTIONS} size="md" active={lib.show !== 'all'} />
        <MoreFilters lib={lib} />
      </div>

      {/* Active filters, each removable. Animated in and out so the list below never jumps. */}
      <AnimatePresence initial={false}>
        {lib.chips.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 pb-3 pl-[var(--rail)] pr-[var(--gx)]">
              <AnimatePresence initial={false} mode="popLayout">
                {lib.chips.map(chip => (
                  <motion.button
                    key={chip.key}
                    layout
                    type="button"
                    onClick={chip.remove}
                    aria-label={`Remove filter: ${chip.label}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
                    className="flex h-8 max-w-full items-center gap-1.5 rounded-full border border-accent/50 bg-accent/15 pl-3 pr-2 text-[13px] font-semibold text-accent-soft transition hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="truncate">{chip.label}</span>
                    <CloseIcon className="h-3.5 w-3.5 shrink-0" />
                  </motion.button>
                ))}
              </AnimatePresence>
              <button type="button" onClick={lib.reset} className="h-8 px-1 text-[13px] font-semibold text-white/70 transition hover:text-white">Clear all</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Results ─────────────────────────────────────────────────────────────────

const GRID: Record<GridSize, { desktop: string; phone: string; sizes: string }> = {
  // Phones ignore the desktop pixel value: compact is three columns, the others two.
  compact: { desktop: '140px', phone: '100px', sizes: '(max-width: 767px) 30vw, 180px' },
  comfortable: { desktop: '168px', phone: '150px', sizes: '(max-width: 767px) 45vw, 200px' },
  large: { desktop: '206px', phone: '150px', sizes: '(max-width: 767px) 45vw, 240px' },
}

/** The titles, as a poster grid or the list. Sorting from the list's column headers is optional. */
export function LibraryResults({ titles, viewMode, gridSize, sort, dir, onSort, emptyText = 'No titles match these filters.' }: {
  titles: ReelTitle[]
  viewMode: LibraryViewMode
  gridSize: GridSize
  sort?: LibrarySort
  dir?: SortDir
  onSort?: (s: LibrarySort) => void
  emptyText?: string
}) {
  if (titles.length === 0) {
    return <p className="pl-[var(--rail)] pr-[var(--gx)] text-sm text-white/60">{emptyText}</p>
  }
  if (viewMode === 'list') {
    return <LibraryList titles={titles} sort={sort} dir={dir} onSort={onSort} />
  }
  const g = GRID[gridSize]
  return (
    <div
      className={`lib-grid grid gap-x-5 pl-[var(--rail)] pr-[var(--gx)] ${gridSize === 'compact' ? 'gap-y-5' : 'gap-y-7'}`}
      style={{
        '--lib-min-desktop': g.desktop,
        '--lib-min-phone': g.phone,
        gridTemplateColumns: 'repeat(auto-fill, minmax(var(--lib-min), 1fr))',
      } as React.CSSProperties}
    >
      {titles.map(t => <PosterCard key={t.id} title={t} width="w-full" overlays dense={gridSize === 'compact'} sizes={g.sizes} />)}
    </div>
  )
}

/**
 * A whole library block: heading with the count, Sort, poster size and view on the
 * right, the filter bar, then the results. `heading` is h1 on the library pages and h2
 * for "Your library" on Media Home.
 */
export function LibrarySection({ lib, title, heading = 'h1' }: { lib: FilteredLibrary; title: string; heading?: 'h1' | 'h2' }) {
  const Heading = heading
  const shown = lib.result.length
  const count = lib.chips.length > 0
    ? `${shown} of ${lib.total} title${lib.total === 1 ? '' : 's'}`
    : `${shown} title${shown === 1 ? '' : 's'}`
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 pl-[var(--rail)] pr-[var(--gx)]">
        <Heading className={heading === 'h1' ? 'text-[34px] font-[800] tracking-[-0.02em] text-ink' : 'text-[20px] font-bold tracking-[-0.01em] text-ink'}>
          {title}
        </Heading>
        <span className={`text-sm text-white/60 ${heading === 'h1' ? 'pt-2' : ''}`} aria-live="polite">{count}</span>
        <div className="flex w-full flex-wrap items-center justify-between gap-1 sm:ml-auto sm:w-auto sm:justify-end sm:gap-2">
          <SortControl lib={lib} />
          {lib.viewMode === 'grid' && <GridSizeControl value={lib.gridSize} onChange={lib.setGridSize} />}
          <ViewControl value={lib.viewMode} onChange={lib.setView} />
        </div>
      </div>
      <LibraryFilterBar lib={lib} />
      <LibraryResults titles={lib.result} viewMode={lib.viewMode} gridSize={lib.gridSize} sort={lib.sort} dir={lib.dir} onSort={lib.chooseSort} />
    </section>
  )
}

/** Standalone library page (Movies / TV / Favorites routes). */
export function LibraryView({ catalog, title, base }: { catalog: ReelTitle[]; title: string; base?: LibraryBase }) {
  const lib = useFilteredLibrary(catalog, base)
  return (
    <div className="py-8">
      <LibrarySection lib={lib} title={title} />
    </div>
  )
}
