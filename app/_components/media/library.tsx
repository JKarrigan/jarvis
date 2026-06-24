'use client'

import { useMemo, useState } from 'react'
import { useMedia } from './MediaProvider'
import type { ReelTitle } from './types'
import {
  allGenres, applyShow, sortTitles,
  type LibrarySort, type LibraryShow, type UserView,
} from './selectors'
import { FilterDropdown } from './FilterDropdown'
import { PosterCard } from './ReelCards'

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

export type LibraryBase = 'movie' | 'tv' | 'favorites'

export function useFilteredLibrary(catalog: ReelTitle[], base?: LibraryBase) {
  const { isWatched, isFavorite } = useMedia()
  const view: UserView = useMemo(() => ({
    watched: (t) => isWatched(t.id, t.watched),
    favorite: (t) => isFavorite(t.id, t.favorite),
  }), [isWatched, isFavorite])

  const [sort, setSort] = useState<LibrarySort>('added')
  const [genre, setGenre] = useState<string>('any')
  const [show, setShow] = useState<LibraryShow>('all')

  const genres = useMemo(() => allGenres(catalog), [catalog])

  const result = useMemo(() => {
    let list = catalog
    if (base === 'movie') list = list.filter(t => t.type === 'movie')
    else if (base === 'tv') list = list.filter(t => t.type === 'tv')
    else if (base === 'favorites') list = list.filter(t => view.favorite(t))
    if (genre !== 'any') list = list.filter(t => t.genres.includes(genre))
    list = applyShow(list, show, view)
    return sortTitles(list, sort)
  }, [catalog, base, genre, show, sort, view])

  const filtersActive = sort !== 'added' || genre !== 'any' || show !== 'all'
  return { sort, setSort, genre, setGenre, show, setShow, genres, result, filtersActive }
}

export function LibraryFilterBar({
  sort, setSort, genre, setGenre, show, setShow, genres, count,
}: {
  sort: LibrarySort; setSort: (v: LibrarySort) => void
  genre: string; setGenre: (v: string) => void
  show: LibraryShow; setShow: (v: LibraryShow) => void
  genres: string[]; count: number
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 pl-[var(--rail)] pr-[var(--gx)]">
      <FilterDropdown label="Sort" value={sort} onChange={setSort} options={SORT_OPTIONS} />
      <FilterDropdown
        label="Genre"
        value={genre}
        onChange={setGenre}
        options={[{ value: 'any', label: 'All genres' }, ...genres.map(g => ({ value: g, label: g }))]}
      />
      <FilterDropdown label="Show" value={show} onChange={setShow} options={SHOW_OPTIONS} />
      <span className="ml-auto text-[13px] text-white/45">{count} title{count === 1 ? '' : 's'}</span>
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
export function LibraryView({ catalog, title, base }: { catalog: ReelTitle[]; title: string; base?: LibraryBase }) {
  const lib = useFilteredLibrary(catalog, base)
  return (
    <div className="py-8">
      <h1 className="mb-5 pl-[var(--rail)] pr-[var(--gx)] text-[34px] font-[800] tracking-[-0.02em] text-ink">{title}</h1>
      <LibraryFilterBar
        sort={lib.sort} setSort={lib.setSort}
        genre={lib.genre} setGenre={lib.setGenre}
        show={lib.show} setShow={lib.setShow}
        genres={lib.genres} count={lib.result.length}
      />
      <LibraryGridInner titles={lib.result} />
    </div>
  )
}
