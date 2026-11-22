import type { LibraryShow, LibrarySort, LibraryType, SortDir } from './selectors'
import { SORT_DEFAULT_DIR } from './selectors'

export type LibraryViewMode = 'grid' | 'list'
export type GridSize = 'compact' | 'comfortable' | 'large'

/** Everything a library page keeps in its URL, so a filtered view survives Back and can be shared. */
export interface LibraryQuery {
  sort: LibrarySort
  dir: SortDir
  type: LibraryType
  genre: string
  tag: string
  director: string
  actor: string
  /** Free-text filter. */
  q: string
  show: LibraryShow
  /** Only set when the URL says so; otherwise the profile's saved preference applies. */
  view?: LibraryViewMode
}

export const LIBRARY_DEFAULTS: LibraryQuery = {
  sort: 'added', dir: SORT_DEFAULT_DIR.added, type: 'all', genre: 'any', tag: 'any', director: 'any', actor: 'any', q: '', show: 'all',
}

const SORTS: readonly LibrarySort[] = ['added', 'title', 'year', 'rating', 'runtime']
const SHOWS: readonly LibraryShow[] = ['all', 'unwatched', 'watched', 'favorites']
const TYPES: readonly LibraryType[] = ['all', 'movie', 'tv']

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined
}

/** Reads a library state from URL params. Unknown or malformed values fall back to the defaults. */
export function parseLibraryQuery(params: URLSearchParams): LibraryQuery {
  const sort = oneOf(params.get('sort'), SORTS) ?? LIBRARY_DEFAULTS.sort
  const text = (key: string) => params.get(key)?.trim() || 'any'
  return {
    sort,
    dir: oneOf(params.get('dir'), ['asc', 'desc'] as const) ?? SORT_DEFAULT_DIR[sort],
    type: oneOf(params.get('type'), TYPES) ?? LIBRARY_DEFAULTS.type,
    genre: text('genre'),
    tag: text('tag'),
    director: text('director'),
    actor: text('actor'),
    q: (params.get('q') ?? '').slice(0, 200),
    show: oneOf(params.get('show'), SHOWS) ?? LIBRARY_DEFAULTS.show,
    view: oneOf(params.get('view'), ['grid', 'list'] as const),
  }
}

/**
 * The query string for a library state ("" or "?genre=Drama&sort=year"). Defaults are
 * left out so an untouched library keeps a clean URL; `dir` is only written when it
 * differs from the sort's natural direction.
 */
export function serializeLibraryQuery(state: LibraryQuery): string {
  const out = new URLSearchParams()
  if (state.genre !== 'any') out.set('genre', state.genre)
  if (state.tag !== 'any') out.set('tag', state.tag)
  if (state.director !== 'any') out.set('director', state.director)
  if (state.actor !== 'any') out.set('actor', state.actor)
  if (state.type !== 'all') out.set('type', state.type)
  if (state.show !== 'all') out.set('show', state.show)
  if (state.q.trim()) out.set('q', state.q.trim())
  if (state.sort !== LIBRARY_DEFAULTS.sort) out.set('sort', state.sort)
  if (state.dir !== SORT_DEFAULT_DIR[state.sort]) out.set('dir', state.dir)
  if (state.view) out.set('view', state.view)
  const qs = out.toString()
  return qs ? `?${qs}` : ''
}
