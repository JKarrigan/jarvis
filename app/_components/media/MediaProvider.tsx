'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { THEMES, type ThemeName } from './themeTokens'
import type { ReelTitle } from './types'
import type { UserView } from './selectors'

export { THEMES, type ThemeName }

/**
 * Per-title override. Legacy `boolean` entries are local-only (written before
 * favorites/watched synced to Jellyfin, or in mock mode) and always win. Object
 * entries are optimistic copies of a write-through to Jellyfin: they win until the
 * server's own value (which the write updated) catches up — see `resolveOverride`.
 */
type Override = boolean | { v: boolean; at: number; synced?: boolean }
type OverrideMap = Record<string, Override>

/** How long a synced override may outrank the server seed (covers server-side caching). */
const OVERRIDE_TTL_MS = 10 * 60_000

function resolveOverride(map: OverrideMap, id: string, serverDefault = false): boolean {
  const o = map[id]
  if (o === undefined) return serverDefault
  if (typeof o === 'boolean') return o
  // The server agrees, or the override is old enough that the server is authoritative.
  if (o.synced && (o.v === serverDefault || Date.now() - o.at > OVERRIDE_TTL_MS)) return serverDefault
  return o.v
}

/** Drop synced overrides past their TTL (the server has caught up by then). */
function pruneOverrides(map: OverrideMap): OverrideMap {
  const now = Date.now()
  let changed = false
  const out: OverrideMap = {}
  for (const [id, o] of Object.entries(map)) {
    if (typeof o === 'object' && o.synced && now - o.at > OVERRIDE_TTL_MS) { changed = true; continue }
    out[id] = o
  }
  return changed ? out : map
}

interface ProfileState {
  theme: ThemeName
  favorites: OverrideMap
  watched: OverrideMap
  ratings: Record<string, number>
  notes: Record<string, string>
  watchlist: string[]
  pickList: string[]
  /** Keyed by Jellyfin episode Id. */
  epWatched: OverrideMap
}

interface PersistShape {
  v: 1
  activeProfile: string
  profiles: Record<string, ProfileState>
}

const STORAGE_KEY = 'reel.media.v1'
const DEFAULT_PROFILE = 'A'
const PROFILE_CYCLE = ['A', 'B', 'C']

function emptyProfile(): ProfileState {
  return { theme: 'ember', favorites: {}, watched: {}, ratings: {}, notes: {}, watchlist: [], pickList: [], epWatched: {} }
}

function initialState(): PersistShape {
  return { v: 1, activeProfile: DEFAULT_PROFILE, profiles: { [DEFAULT_PROFILE]: emptyProfile() } }
}

function toggleInArray(arr: string[], id: string): string[] {
  return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]
}

type OverrideField = 'favorites' | 'watched' | 'epWatched'

/** Write a favorite / played flag through to Jellyfin. Resolves to 'synced', 'local'
    (mock mode: nothing to write to) or 'failed'. */
async function writeThrough(field: OverrideField, id: string, value: boolean): Promise<'synced' | 'local' | 'failed'> {
  const kind = field === 'favorites' ? 'favorite' : 'played'
  try {
    const res = await fetch(`/api/jellyfin/${kind}/${encodeURIComponent(id)}`, { method: value ? 'POST' : 'DELETE' })
    if (!res.ok) return 'failed'
    const body = (await res.json().catch(() => ({}))) as { local?: boolean }
    return body.local ? 'local' : 'synced'
  } catch {
    return 'failed'
  }
}

// ---------------------------------------------------------------------------
// Contexts. Split so a component only re-renders for the state it reads: typing a
// note must not re-render every poster card on the page.
// ---------------------------------------------------------------------------

interface ProfileContextValue {
  ready: boolean
  activeProfile: string
  profileIds: string[]
  switchProfile: () => void
  theme: ThemeName
  setTheme: (t: ThemeName) => void
}

interface TitleStateValue {
  isFavorite: (id: string, serverDefault?: boolean) => boolean
  isWatched: (id: string, serverDefault?: boolean) => boolean
  isEpWatched: (episodeId: string, serverDefault?: boolean) => boolean
  inWatchlist: (id: string) => boolean
  inPickList: (id: string) => boolean
  toggleFavorite: (id: string, serverDefault?: boolean) => void
  toggleWatched: (id: string, serverDefault?: boolean) => void
  toggleEpWatched: (episodeId: string, serverDefault?: boolean) => void
  toggleWatchlist: (id: string) => void
  togglePickList: (id: string) => void
  clearPickList: () => void
  removeFromPickList: (id: string) => void
  watchlist: string[]
  pickList: string[]
}

interface NotesValue {
  rating: (id: string) => number
  notes: (id: string) => string
  setRating: (id: string, value: number) => void
  setNotes: (id: string, text: string) => void
  ratings: Record<string, number>
}

type MediaContextValue = ProfileContextValue & TitleStateValue & NotesValue

const ProfileContext = createContext<ProfileContextValue | null>(null)
const TitleStateContext = createContext<TitleStateValue | null>(null)
const NotesContext = createContext<NotesValue | null>(null)

export function MediaProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistShape>(initialState)
  const [ready, setReady] = useState(false)
  const hydrated = useRef(false)

  // Hydrate from localStorage once on mount. This is a deliberate one-time
  // SSR-safe hydration (localStorage is unavailable on the server, so it can't be
  // a lazy useState initializer without a hydration mismatch) — hence the rule opt-out.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as PersistShape
        if (parsed && parsed.v === 1 && parsed.profiles) {
          // ensure every profile has all keys (forward-compat merge)
          const merged: Record<string, ProfileState> = {}
          for (const [id, p] of Object.entries(parsed.profiles)) {
            const full = { ...emptyProfile(), ...p }
            merged[id] = {
              ...full,
              favorites: pruneOverrides(full.favorites),
              watched: pruneOverrides(full.watched),
              epWatched: pruneOverrides(full.epWatched),
            }
          }
          setState({ v: 1, activeProfile: parsed.activeProfile || DEFAULT_PROFILE, profiles: merged })
        }
      }
    } catch {
      /* corrupt storage — fall back to defaults */
    }
    hydrated.current = true
    setReady(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist after hydration, debounced (a note is typed one key at a time), and
  // flushed when the page is hidden so nothing is lost on close.
  const latest = useRef(state)
  useEffect(() => {
    latest.current = state
    if (!hydrated.current) return
    const write = () => {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(latest.current)) } catch { /* quota / private mode */ }
    }
    const t = setTimeout(write, 400)
    window.addEventListener('pagehide', write)
    return () => { clearTimeout(t); window.removeEventListener('pagehide', write) }
  }, [state])

  const profile = state.profiles[state.activeProfile] ?? emptyProfile()

  // Update the active profile immutably.
  const updateProfile = useCallback((fn: (p: ProfileState) => ProfileState) => {
    setState(s => {
      const cur = s.profiles[s.activeProfile] ?? emptyProfile()
      return { ...s, profiles: { ...s.profiles, [s.activeProfile]: fn(cur) } }
    })
  }, [])

  // Optimistic set + write-through to Jellyfin; reverted if the write fails.
  const setOverride = useCallback((field: OverrideField, id: string, next: boolean) => {
    const at = Date.now()
    updateProfile(p => ({ ...p, [field]: { ...p[field], [id]: { v: next, at } } }))
    void writeThrough(field, id, next).then(result => {
      updateProfile(p => {
        const cur = p[field][id]
        // A newer toggle has superseded this one — leave it alone.
        if (typeof cur !== 'object' || cur.at !== at) return p
        const map = { ...p[field] }
        if (result === 'synced') map[id] = { v: next, at: Date.now(), synced: true }
        else if (result === 'local') map[id] = next
        else delete map[id]
        return { ...p, [field]: map }
      })
    })
  }, [updateProfile])

  const profileValue = useMemo<ProfileContextValue>(() => ({
    ready,
    activeProfile: state.activeProfile,
    profileIds: Object.keys(state.profiles),
    switchProfile: () =>
      setState(s => {
        const idx = PROFILE_CYCLE.indexOf(s.activeProfile)
        const next = PROFILE_CYCLE[(idx + 1) % PROFILE_CYCLE.length]
        const profiles = s.profiles[next] ? s.profiles : { ...s.profiles, [next]: emptyProfile() }
        return { ...s, activeProfile: next, profiles }
      }),
    theme: profile.theme,
    setTheme: (t) => updateProfile(p => ({ ...p, theme: t })),
  }), [ready, state.activeProfile, state.profiles, profile.theme, updateProfile])

  const { favorites, watched, epWatched, watchlist, pickList, ratings, notes } = profile

  const titleValue = useMemo<TitleStateValue>(() => ({
    isFavorite: (id, d) => resolveOverride(favorites, id, d),
    isWatched: (id, d) => resolveOverride(watched, id, d),
    isEpWatched: (id, d) => resolveOverride(epWatched, id, d),
    inWatchlist: (id) => watchlist.includes(id),
    inPickList: (id) => pickList.includes(id),
    toggleFavorite: (id, d) => setOverride('favorites', id, !resolveOverride(favorites, id, d)),
    toggleWatched: (id, d) => setOverride('watched', id, !resolveOverride(watched, id, d)),
    toggleEpWatched: (id, d) => setOverride('epWatched', id, !resolveOverride(epWatched, id, d)),
    toggleWatchlist: (id) => updateProfile(p => ({ ...p, watchlist: toggleInArray(p.watchlist, id) })),
    togglePickList: (id) => updateProfile(p => ({ ...p, pickList: toggleInArray(p.pickList, id) })),
    clearPickList: () => updateProfile(p => ({ ...p, pickList: [] })),
    removeFromPickList: (id) => updateProfile(p => ({ ...p, pickList: p.pickList.filter(x => x !== id) })),
    watchlist,
    pickList,
  }), [favorites, watched, epWatched, watchlist, pickList, setOverride, updateProfile])

  const notesValue = useMemo<NotesValue>(() => ({
    rating: (id) => ratings[id] ?? 0,
    notes: (id) => notes[id] ?? '',
    setRating: (id, value) => updateProfile(p => ({ ...p, ratings: { ...p.ratings, [id]: value } })),
    setNotes: (id, text) => updateProfile(p => ({ ...p, notes: { ...p.notes, [id]: text } })),
    ratings,
  }), [ratings, notes, updateProfile])

  return (
    <ProfileContext.Provider value={profileValue}>
      <TitleStateContext.Provider value={titleValue}>
        <NotesContext.Provider value={notesValue}>{children}</NotesContext.Provider>
      </TitleStateContext.Provider>
    </ProfileContext.Provider>
  )
}

function need<T>(v: T | null, hook: string): T {
  if (!v) throw new Error(`${hook} must be used within <MediaProvider>`)
  return v
}

/** Theme + profile only. */
export function useMediaProfile(): ProfileContextValue {
  return need(useContext(ProfileContext), 'useMediaProfile')
}

/** Favorites / watched / watchlist / picker list — what cards and detail actions read. */
export function useTitleState(): TitleStateValue {
  return need(useContext(TitleStateContext), 'useTitleState')
}

/** Personal ratings + notes. */
export function useMediaNotes(): NotesValue {
  return need(useContext(NotesContext), 'useMediaNotes')
}

/** Everything (re-renders on any change — prefer the narrower hooks in lists). */
export function useMedia(): MediaContextValue {
  return { ...useMediaProfile(), ...useTitleState(), ...useMediaNotes() }
}

/** Resolved watched/favorite predicates (server seed + local overlay) for the selectors. */
export function useUserView(): UserView {
  const { isWatched, isFavorite } = useTitleState()
  return useMemo(() => ({
    watched: (t: ReelTitle) => isWatched(t.id, t.watched),
    favorite: (t: ReelTitle) => isFavorite(t.id, t.favorite),
  }), [isWatched, isFavorite])
}
