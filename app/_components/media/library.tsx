'use client'

import { useMemo, useState } from 'react'
import { useMedia } from './MediaProvider'
import type { ReelTitle } from './types'
import {
  allGenres, allPeople, allTags, applyShow, creditedAs, effectiveGenres, matchesQuery, sortTitles,
  type LibrarySort, type LibraryShow, type LibraryType, type PersonOption, type UserView,
} from './selectors'
import { FilterDropdown } from './FilterDropdown'
import { PosterCard } from './ReelCards'
import { SearchIcon, CloseIcon } from './icons'

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: 'added', label: 'Date added' },
  { value: 'title', label: 'Title (A–Z)' },
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

export type LibraryBase = 'movie' | 'tv' | 'favorites'

export function useFilteredLibrary(catalog: ReelTitle[], base?: LibraryBase, initialGenre?: string, initialTag?: string) {
  const { isWatched, isFavorite } = useMedia()
  const view: UserView = useMemo(() => ({
    watched: (t) => isWatched(t.id, t.watched),
    favorite: (t) => isFavorite(t.id, t.favorite),
  }), [isWatched, isFavorite])

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

  const [sort, setSort] = useState<LibrarySort>('added')
  const [type, setType] = useState<LibraryType>('all')
  const [genre, setGenre] = useState<string>(() =>
    initialGenre && genres.includes(initialGenre) ? initialGenre : 'any')
  const [tag, setTag] = useState<string>(() =>
    initialTag && tags.includes(initialTag) ? initialTag : 'any')
  const [director, setDirector] = useState<string>('any')
  const [actor, setActor] = useState<string>('any')
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<LibraryShow>('all')

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
    return sortTitles(list, sort)
  }, [scoped, type, genre, tag, director, actor, query, show, sort, view])

  const filtersActive = sort !== 'added' || type !== 'all' || genre !== 'any' || tag !== 'any'
    || director !== 'any' || actor !== 'any' || query.trim() !== '' || show !== 'all'
  const reset = () => {
    setSort('added'); setType('all'); setGenre('any'); setTag('any')
    setDirector('any'); setActor('any'); setQuery(''); setShow('all')
  }

  return {
    sort, setSort, type, setType, genre, setGenre, tag, setTag, director, setDirector, actor, setActor,
    query, setQuery, show, setShow, genres, tags, directors, actors, result, filtersActive, reset,
    /** Type is fixed by the Movies / TV routes, so only the mixed views offer the facet. */
    typeFilterable: base !== 'movie' && base !== 'tv',
  }
}

export type FilteredLibrary = ReturnType<typeof useFilteredLibrary>

function peopleOptions(people: PersonOption[], anyLabel: string) {
  return [{ value: 'any', label: anyLabel }, ...people.map(p => ({ value: p.id, label: p.name, hint: String(p.count) }))]
}

export function LibraryFilterBar({ lib }: { lib: FilteredLibrary }) {
  const count = lib.result.length
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 pl-[var(--rail)] pr-[var(--gx)]">
      <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-border bg-white/5 px-3 py-1.5 text-[13px] text-ink backdrop-blur-md transition focus-within:bg-white/10 sm:max-w-[320px]">
        <SearchIcon className="h-4 w-4 shrink-0 text-white/40" />
        <input
          value={lib.query}
          onChange={e => lib.setQuery(e.target.value)}
          placeholder="Filter by title or name…"
          className="min-w-0 flex-1 bg-transparent placeholder:text-white/35 focus:outline-none"
        />
        {lib.query && (
          <button type="button" onClick={() => lib.setQuery('')} aria-label="Clear" className="grid h-5 w-5 place-items-center rounded text-white/45 hover:text-white">
            <CloseIcon className="h-3 w-3" />
          </button>
        )}
      </label>
      {lib.typeFilterable && <FilterDropdown label="Type" value={lib.type} onChange={lib.setType} options={TYPE_OPTIONS} />}
      <FilterDropdown
        label="Genre"
        value={lib.genre}
        onChange={lib.setGenre}
        options={[{ value: 'any', label: 'All genres' }, ...lib.genres.map(g => ({ value: g, label: g }))]}
      />
      {lib.tags.length > 0 && (
        <FilterDropdown
          label="Tag"
          value={lib.tag}
          onChange={lib.setTag}
          options={[{ value: 'any', label: 'All tags' }, ...lib.tags.map(t => ({ value: t, label: t }))]}
          searchable={lib.tags.length > 12}
        />
      )}
      {lib.directors.length > 0 && (
        <FilterDropdown label="Director" value={lib.director} onChange={lib.setDirector} options={peopleOptions(lib.directors, 'Any director')} searchable />
      )}
      {lib.actors.length > 0 && (
        <FilterDropdown label="Actor" value={lib.actor} onChange={lib.setActor} options={peopleOptions(lib.actors, 'Any actor')} searchable />
      )}
      <FilterDropdown label="Show" value={lib.show} onChange={lib.setShow} options={SHOW_OPTIONS} />
      <FilterDropdown label="Sort" value={lib.sort} onChange={lib.setSort} options={SORT_OPTIONS} />
      <span className="ml-auto flex items-center gap-3 text-[13px] text-white/45">
        {lib.filtersActive && (
          <button type="button" onClick={lib.reset} className="font-semibold text-accent-soft transition hover:text-ink">Reset</button>
        )}
        {count} title{count === 1 ? '' : 's'}
      </span>
    </div>
  )
}

export function LibraryGridInner({ titles }: { titles: ReelTitle[] }) {
  if (titles.length === 0) {
    return <p className="pl-[var(--rail)] pr-[var(--gx)] text-sm text-white/45">No titles match these filters.</p>
  }
  return (
    <div
      className="grid gap-x-5 gap-y-7 pl-[var(--rail)] pr-[var(--gx)]"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--grid-min), 1fr))' }}
    >
      {titles.map(t => <PosterCard key={t.id} title={t} width="w-full" overlays />)}
    </div>
  )
}

/** Standalone library page (Movies / TV / Favorites routes). */
export function LibraryView({ catalog, title, base, initialGenre, initialTag }: { catalog: ReelTitle[]; title: string; base?: LibraryBase; initialGenre?: string; initialTag?: string }) {
  const lib = useFilteredLibrary(catalog, base, initialGenre, initialTag)
  return (
    <div className="py-8">
      <h1 className="mb-5 pl-[var(--rail)] pr-[var(--gx)] text-[34px] font-[800] tracking-[-0.02em] text-ink">{title}</h1>
      <LibraryFilterBar lib={lib} />
      <LibraryGridInner titles={lib.result} />
    </div>
  )
}
