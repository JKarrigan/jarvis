import type { CollectionSummary, ReelTitle } from './types'

/** Days within which a title still counts as "recently added" (drives the New badge). */
export const RECENTLY_ADDED_DAYS = 30

/** Resolved per-title predicates (server seed + client overlay), supplied by the caller. */
export interface UserView {
  watched: (t: ReelTitle) => boolean
  favorite: (t: ReelTitle) => boolean
}

/** Metadata providers label the same genre differently per library — TMDB's TV
    genres are compounds ("Sci-Fi & Fantasy", "Action & Adventure") while movies use
    the plain names, so a compound chip matches zero titles once a type filter is on.
    Aliases fan each raw label out to canonical names; lookup is case-insensitive. */
const GENRE_ALIASES: Record<string, string[]> = {
  'sci-fi': ['Science Fiction'],
  'sci-fi & fantasy': ['Science Fiction', 'Fantasy'],
  'science-fiction': ['Science Fiction'],
  'action & adventure': ['Action', 'Adventure'],
  'war & politics': ['War'],
  'kids': ['Family'],
  'children': ['Family'],
}

/** Raw genre labels with aliases resolved to canonical names (deduped). */
export function canonicalizeGenres(genres: string[]): string[] {
  const out = new Set<string>()
  for (const g of genres) for (const c of GENRE_ALIASES[g.toLowerCase()] ?? [g]) out.add(c)
  return [...out]
}

/** A title's genres in canonical form. */
export function effectiveGenres(t: ReelTitle): string[] {
  return canonicalizeGenres(t.genres)
}

/** A show's runtime ≈ episodes × 45m; movies use their own runtime. */
export function effectiveRuntime(t: ReelTitle): number {
  if (t.type === 'tv') return (t.episodes ?? (t.seasons ?? 1) * 8) * 45
  return t.runtime ?? 100
}

/** Genre-weighted recommendations from watched/favorited titles (Reel algorithm). */
export function recommendations(
  catalog: ReelTitle[],
  view: UserView,
  limit = 8,
): { titles: ReelTitle[]; topGenre?: string } {
  const weights = new Map<string, number>()
  for (const t of catalog) {
    if (view.watched(t) || view.favorite(t)) {
      for (const g of effectiveGenres(t)) weights.set(g, (weights.get(g) ?? 0) + 1)
    }
  }
  const affinity = (t: ReelTitle) => effectiveGenres(t).reduce((s, g) => s + (weights.get(g) ?? 0), 0)
  const scored = catalog
    .filter(t => !view.watched(t) && t.progress === 0)
    .map(t => ({ t, score: affinity(t) * 2 + (t.imdb ?? 0) }))
    .sort((a, b) => b.score - a.score)

  let topGenre: string | undefined
  let max = 0
  for (const [g, w] of weights) if (w > max) { max = w; topGenre = g }

  return { titles: scored.slice(0, limit).map(s => s.t), topGenre }
}

/** Fisher–Yates shuffle (client-side; Math.random is fine here). */
export function shuffle<T>(input: T[]): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export type PickerType = 'all' | 'movie' | 'tv'
export type PickerMood = 'crowd' | 'hidden' | 'quick' | 'epic'
export type PickerSort = 'shuffle' | 'top' | 'newest' | 'shortest'
export type PickerMatch = 'any' | 'all'

export interface PickerFilters {
  type: PickerType
  /** Empty array = any genre. */
  genres: string[]
  /** Empty array = any mood. */
  moods: PickerMood[]
  /** Combines selections within the genres facet and within the moods facet; facets always AND. */
  match: PickerMatch
  /** Empty array = any collection. Selected collections union together, then AND with every other facet (match does not apply). */
  collectionIds: string[]
  sort: PickerSort
  hideWatched: boolean
}

const MOOD_PRED: Record<PickerMood, (t: ReelTitle) => boolean> = {
  crowd: t => (t.imdb ?? 0) >= 7.5,
  hidden: t => (t.imdb ?? 0) >= 6.5 && (t.imdb ?? 0) < 8,
  quick: t => effectiveRuntime(t) <= 110,
  epic: t => effectiveRuntime(t) >= 140,
}

export function pickerPool(catalog: ReelTitle[], f: PickerFilters, view: UserView, collections: CollectionSummary[] = []): ReelTitle[] {
  const collectionMembers = f.collectionIds.length
    ? new Set(collections.filter(c => f.collectionIds.includes(c.id)).flatMap(c => c.itemIds))
    : null
  const pool = catalog.filter(t => {
    if (collectionMembers && !collectionMembers.has(t.id)) return false
    if (f.type !== 'all' && t.type !== f.type) return false
    if (f.hideWatched && view.watched(t)) return false
    if (f.genres.length) {
      const tg = effectiveGenres(t)
      const hit = f.match === 'all'
        ? f.genres.every(g => tg.includes(g))
        : f.genres.some(g => tg.includes(g))
      if (!hit) return false
    }
    if (f.moods.length) {
      const hit = f.match === 'all'
        ? f.moods.every(m => MOOD_PRED[m](t))
        : f.moods.some(m => MOOD_PRED[m](t))
      if (!hit) return false
    }
    return true
  })

  if (f.sort === 'top') return [...pool].sort((a, b) => (b.imdb ?? 0) - (a.imdb ?? 0))
  if (f.sort === 'newest') return [...pool].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  if (f.sort === 'shortest') return [...pool].sort((a, b) => effectiveRuntime(a) - effectiveRuntime(b))
  return shuffle(pool)
}

export type LibrarySort = 'added' | 'title' | 'year' | 'rating' | 'runtime'
export type LibraryShow = 'all' | 'unwatched' | 'watched' | 'favorites'
export type LibraryType = 'all' | 'movie' | 'tv'
export type CreditRole = 'director' | 'actor'

export interface PersonOption {
  id: string
  name: string
  /** Titles in the list they hold this credit on. */
  count: number
}

/** Everyone credited on the given titles in one capacity, A–Z, with their title counts. */
export function allPeople(list: ReelTitle[], role: CreditRole): PersonOption[] {
  const map = new Map<string, PersonOption>()
  for (const t of list) {
    for (const c of t.people ?? []) {
      if ((role === 'director') !== Boolean(c.director)) continue
      const p = map.get(c.id) ?? { id: c.id, name: c.name, count: 0 }
      p.count++
      map.set(c.id, p)
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** True when the person holds this kind of credit on the title. */
export function creditedAs(t: ReelTitle, personId: string, role: CreditRole): boolean {
  return (t.people ?? []).some(c => c.id === personId && (role === 'director') === Boolean(c.director))
}

/** Free-text library filter: the title, or anyone credited on it. `needle` is lower-case. */
export function matchesQuery(t: ReelTitle, needle: string): boolean {
  return t.title.toLowerCase().includes(needle) || (t.people ?? []).some(c => c.name.toLowerCase().includes(needle))
}

export type SortDir = 'asc' | 'desc'

/** The direction each sort starts in: newest, highest and A to Z first, shortest first. */
export const SORT_DEFAULT_DIR: Record<LibrarySort, SortDir> = {
  added: 'desc', title: 'asc', year: 'desc', rating: 'desc', runtime: 'asc',
}

/** The value a sort orders by; null when the title has none (those always sort last). */
function sortKey(t: ReelTitle, sort: LibrarySort): number | null {
  switch (sort) {
    case 'year': return t.year ?? null
    case 'rating': return t.imdb ?? null
    case 'runtime': return effectiveRuntime(t)
    case 'added': return t.addedAt ?? null
    default: return null
  }
}

/**
 * Sorted copy. `dir` defaults to the sort's natural direction. Titles missing the sorted
 * value go last in either direction, and ties fall back to the title so the order is stable.
 */
export function sortTitles(list: ReelTitle[], sort: LibrarySort, dir: SortDir = SORT_DEFAULT_DIR[sort]): ReelTitle[] {
  const sign = dir === 'asc' ? 1 : -1
  const byTitle = (a: ReelTitle, b: ReelTitle) => a.title.localeCompare(b.title)
  if (sort === 'title') return [...list].sort((a, b) => sign * byTitle(a, b))
  return [...list].sort((a, b) => {
    const ka = sortKey(a, sort)
    const kb = sortKey(b, sort)
    if (ka === null || kb === null) return ka === kb ? byTitle(a, b) : ka === null ? 1 : -1
    return ka === kb ? byTitle(a, b) : sign * (ka - kb)
  })
}

/** The first directing credit on a title, for the list view's Director column. */
export function firstDirector(t: ReelTitle): string | undefined {
  return t.people?.find(c => c.director)?.name
}

const ADDED_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const ADDED_DATE_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/**
 * "Today", "Yesterday", "5d ago" for the first 30 days, then a date ("Oct 17", with the
 * year once it is a different one). Dates are in the viewer's time zone, so only call
 * this on the client (the list passes a clock that is null during server rendering).
 */
export function addedLabel(days: number | undefined, addedAt: number | undefined, nowMs: number): string {
  if (days == null) return ''
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days <= 30 || addedAt == null) return `${days}d ago`
  const sameYear = new Date(addedAt).getFullYear() === new Date(nowMs).getFullYear()
  return (sameYear ? ADDED_DATE : ADDED_DATE_YEAR).format(addedAt)
}

/** "2h 9m" for movies, "3 seasons" for shows. */
export function lengthLabel(t: ReelTitle): string {
  if (t.type === 'tv') return t.seasons ? `${t.seasons} season${t.seasons === 1 ? '' : 's'}` : ''
  if (!t.runtime) return ''
  const h = Math.floor(t.runtime / 60)
  return h > 0 ? `${h}h ${t.runtime % 60}m` : `${t.runtime}m`
}

export function applyShow(list: ReelTitle[], show: LibraryShow, view: UserView): ReelTitle[] {
  switch (show) {
    case 'unwatched': return list.filter(t => !view.watched(t))
    case 'watched': return list.filter(t => view.watched(t))
    case 'favorites': return list.filter(t => view.favorite(t))
    default: return list
  }
}

export function allGenres(catalog: ReelTitle[]): string[] {
  const set = new Set<string>()
  for (const t of catalog) for (const g of effectiveGenres(t)) set.add(g)
  return [...set].sort()
}

export function allTags(catalog: ReelTitle[]): string[] {
  const set = new Set<string>()
  for (const t of catalog) for (const tag of t.tags ?? []) set.add(tag)
  return [...set].sort()
}

export interface Stats {
  hours: number
  days: number
  films: number
  series: number
  avgRating: number
  topGenres: [string, number][]
  favCount: number
  watchlistCount: number
}

export function computeStats(
  catalog: ReelTitle[],
  view: UserView,
  ratings: Record<string, number>,
  watchlistCount: number,
): Stats {
  const watched = catalog.filter(t => view.watched(t))
  const minutes = watched.reduce((s, t) => s + effectiveRuntime(t), 0)
  const hours = Math.round(minutes / 60)
  const ratingVals = Object.values(ratings).filter(v => v > 0)
  const avgRating = ratingVals.length ? ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length : 0
  const genreCount = new Map<string, number>()
  for (const t of watched) for (const g of effectiveGenres(t)) genreCount.set(g, (genreCount.get(g) ?? 0) + 1)
  const topGenres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  return {
    hours,
    days: Math.round((hours / 24) * 10) / 10,
    films: watched.filter(t => t.type === 'movie').length,
    series: watched.filter(t => t.type === 'tv').length,
    avgRating,
    topGenres,
    favCount: catalog.filter(t => view.favorite(t)).length,
    watchlistCount,
  }
}
