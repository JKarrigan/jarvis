import type { CollectionSummary, ReelTitle } from './types'

/** Days within which a title still counts as "recently added" (drives the New badge). */
export const RECENTLY_ADDED_DAYS = 30

/** Resolved per-title predicates (server seed + client overlay), supplied by the caller. */
export interface UserView {
  watched: (t: ReelTitle) => boolean
  favorite: (t: ReelTitle) => boolean
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
      for (const g of t.genres) weights.set(g, (weights.get(g) ?? 0) + 1)
    }
  }
  const affinity = (t: ReelTitle) => t.genres.reduce((s, g) => s + (weights.get(g) ?? 0), 0)
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
      const hit = f.match === 'all'
        ? f.genres.every(g => t.genres.includes(g))
        : f.genres.some(g => t.genres.includes(g))
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

export function sortTitles(list: ReelTitle[], sort: LibrarySort): ReelTitle[] {
  const arr = [...list]
  switch (sort) {
    case 'title': return arr.sort((a, b) => a.title.localeCompare(b.title))
    case 'year': return arr.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    case 'rating': return arr.sort((a, b) => (b.imdb ?? 0) - (a.imdb ?? 0))
    case 'runtime': return arr.sort((a, b) => effectiveRuntime(a) - effectiveRuntime(b))
    case 'added':
    default: return arr.sort((a, b) => (b.addedAt ?? -Infinity) - (a.addedAt ?? -Infinity))
  }
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
  for (const t of catalog) for (const g of t.genres) set.add(g)
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
  for (const t of watched) for (const g of t.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1)
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
