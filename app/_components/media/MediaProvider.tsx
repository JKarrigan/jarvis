'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

export type ThemeName = 'ember' | 'aurora' | 'sage' | 'midnight' | 'noir'

export const THEMES: { key: ThemeName; name: string; blurb: string; accent: string; bg: string }[] = [
  { key: 'ember', name: 'Ember', blurb: 'Warm gold, candlelit darks', accent: '#e0a872', bg: 'radial-gradient(135% 135% at 94% 100%, rgba(224,168,114,0.17), transparent 62%), linear-gradient(150deg,#14110c,#0b0805)' },
  { key: 'aurora', name: 'Aurora', blurb: 'Violet glow, glassy surfaces', accent: '#c08af0', bg: 'radial-gradient(135% 135% at 94% 100%, rgba(168,108,224,0.20), transparent 62%), linear-gradient(150deg,#0f0c18,#08060d)' },
  { key: 'sage', name: 'Sage', blurb: 'Soft green, calm and low-key', accent: '#86cfa6', bg: 'radial-gradient(135% 135% at 94% 100%, rgba(110,200,150,0.15), transparent 62%), linear-gradient(150deg,#0c1511,#060e09)' },
  { key: 'midnight', name: 'Midnight', blurb: 'Electric blue, deep space', accent: '#8ea6ff', bg: 'radial-gradient(135% 135% at 94% 100%, rgba(90,110,230,0.22), transparent 62%), linear-gradient(150deg,#0a0d1d,#05060f)' },
  { key: 'noir', name: 'Noir', blurb: 'Restrained, near monochrome', accent: '#b9b4d6', bg: 'radial-gradient(135% 135% at 94% 100%, rgba(120,116,150,0.15), transparent 62%), linear-gradient(150deg,#111016,#090909)' },
]

interface ProfileState {
  theme: ThemeName
  /** Local override maps (presence wins over the Jellyfin server seed). */
  favorites: Record<string, boolean>
  watched: Record<string, boolean>
  ratings: Record<string, number>
  notes: Record<string, string>
  watchlist: string[]
  pickList: string[]
  /** Keyed by Jellyfin episode Id. */
  epWatched: Record<string, boolean>
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
  return {
    theme: 'ember',
    favorites: {},
    watched: {},
    ratings: {},
    notes: {},
    watchlist: [],
    pickList: [],
    epWatched: {},
  }
}

function initialState(): PersistShape {
  return { v: 1, activeProfile: DEFAULT_PROFILE, profiles: { [DEFAULT_PROFILE]: emptyProfile() } }
}

function toggleInArray(arr: string[], id: string): string[] {
  return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]
}

interface MediaContextValue {
  ready: boolean
  activeProfile: string
  profileIds: string[]
  switchProfile: () => void

  theme: ThemeName
  setTheme: (t: ThemeName) => void

  // per-title selectors (server value seeds the result; local override wins)
  isFavorite: (id: string, serverDefault?: boolean) => boolean
  isWatched: (id: string, serverDefault?: boolean) => boolean
  rating: (id: string) => number
  notes: (id: string) => string
  inWatchlist: (id: string) => boolean
  inPickList: (id: string) => boolean
  isEpWatched: (episodeId: string, serverDefault?: boolean) => boolean

  // actions
  toggleFavorite: (id: string, serverDefault?: boolean) => void
  toggleWatched: (id: string, serverDefault?: boolean) => void
  setRating: (id: string, value: number) => void
  setNotes: (id: string, text: string) => void
  toggleWatchlist: (id: string) => void
  togglePickList: (id: string) => void
  clearPickList: () => void
  removeFromPickList: (id: string) => void
  toggleEpWatched: (episodeId: string, serverDefault?: boolean) => void

  // raw lists for pages that enumerate
  watchlist: string[]
  pickList: string[]
  favoriteOverrides: Record<string, boolean>
  watchedOverrides: Record<string, boolean>
  ratings: Record<string, number>
}

const MediaContext = createContext<MediaContextValue | null>(null)

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
            merged[id] = { ...emptyProfile(), ...p }
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

  // Persist on change (after hydration).
  useEffect(() => {
    if (!hydrated.current) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [state])

  const profile = state.profiles[state.activeProfile] ?? emptyProfile()

  // Update the active profile immutably.
  const updateProfile = useCallback((fn: (p: ProfileState) => ProfileState) => {
    setState(s => {
      const cur = s.profiles[s.activeProfile] ?? emptyProfile()
      return { ...s, profiles: { ...s.profiles, [s.activeProfile]: fn(cur) } }
    })
  }, [])

  const value = useMemo<MediaContextValue>(() => {
    const overrideBool = (map: Record<string, boolean>, id: string, serverDefault = false) =>
      Object.prototype.hasOwnProperty.call(map, id) ? map[id] : serverDefault

    return {
      ready,
      activeProfile: state.activeProfile,
      profileIds: Object.keys(state.profiles),
      switchProfile: () =>
        setState(s => {
          const order = PROFILE_CYCLE
          const idx = order.indexOf(s.activeProfile)
          const next = order[(idx + 1) % order.length]
          const profiles = s.profiles[next] ? s.profiles : { ...s.profiles, [next]: emptyProfile() }
          return { ...s, activeProfile: next, profiles }
        }),

      theme: profile.theme,
      setTheme: (t) => updateProfile(p => ({ ...p, theme: t })),

      isFavorite: (id, d) => overrideBool(profile.favorites, id, d),
      isWatched: (id, d) => overrideBool(profile.watched, id, d),
      rating: (id) => profile.ratings[id] ?? 0,
      notes: (id) => profile.notes[id] ?? '',
      inWatchlist: (id) => profile.watchlist.includes(id),
      inPickList: (id) => profile.pickList.includes(id),
      isEpWatched: (epId, d) => overrideBool(profile.epWatched, epId, d),

      toggleFavorite: (id, d) =>
        updateProfile(p => ({ ...p, favorites: { ...p.favorites, [id]: !overrideBool(p.favorites, id, d) } })),
      toggleWatched: (id, d) =>
        updateProfile(p => ({ ...p, watched: { ...p.watched, [id]: !overrideBool(p.watched, id, d) } })),
      setRating: (id, value) => updateProfile(p => ({ ...p, ratings: { ...p.ratings, [id]: value } })),
      setNotes: (id, text) => updateProfile(p => ({ ...p, notes: { ...p.notes, [id]: text } })),
      toggleWatchlist: (id) => updateProfile(p => ({ ...p, watchlist: toggleInArray(p.watchlist, id) })),
      togglePickList: (id) => updateProfile(p => ({ ...p, pickList: toggleInArray(p.pickList, id) })),
      clearPickList: () => updateProfile(p => ({ ...p, pickList: [] })),
      removeFromPickList: (id) => updateProfile(p => ({ ...p, pickList: p.pickList.filter(x => x !== id) })),
      toggleEpWatched: (epId, d) =>
        updateProfile(p => ({ ...p, epWatched: { ...p.epWatched, [epId]: !overrideBool(p.epWatched, epId, d) } })),

      watchlist: profile.watchlist,
      pickList: profile.pickList,
      favoriteOverrides: profile.favorites,
      watchedOverrides: profile.watched,
      ratings: profile.ratings,
    }
  }, [ready, state.activeProfile, state.profiles, profile, updateProfile])

  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>
}

export function useMedia(): MediaContextValue {
  const ctx = useContext(MediaContext)
  if (!ctx) throw new Error('useMedia must be used within <MediaProvider>')
  return ctx
}
