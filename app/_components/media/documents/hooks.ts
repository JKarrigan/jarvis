'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  DocsApiError, errorText, isAbort, searchAll, storageStatus,
  type DocItem, type StorageStatus,
} from './api'
import { REVALIDATE_AFTER, folderCache } from './folderCache'
import { DEFAULT_SORT, type Sort, type SortField } from './selection'

const NO_ITEMS: DocItem[] = []

/** An uncached folder keeps the previous one on screen this long before showing the skeleton (ms). */
export const SKELETON_DELAY = 400

type Failure = {
  /** The folder the request was for. */
  key: string
  error: string
  status: number
  offline: boolean
}

const serverVersion = () => 0

/**
 * The folder to show, from the tab's listing cache (`folderCache`), stale-while-revalidate.
 *
 * - A cached folder shows in the same render; it's refetched in the background when
 *   older than `REVALIDATE_AFTER` (an unchanged answer re-renders nothing).
 * - An uncached one keeps the previous folder's listing on screen (`pending`, for the
 *   progress bar) until its own arrives; only after `SKELETON_DELAY` with nothing does
 *   it report `slow` (the skeleton). The very first load is `loading`.
 * - `reload()` refetches in place after an edit; a failed background refetch keeps the
 *   cached items unless the folder is gone (404) or storage went offline.
 * - `patch()` / `addLocal()` edit the cache optimistically (rename, stored uploads,
 *   folders a drop created); additions survive a refetch that started before them.
 *
 * State is keyed by folder, so a slow answer for a folder you left never shows under
 * another one.
 */
export function useFolder(folder: string) {
  const cache = folderCache
  useSyncExternalStore(cache.subscribe, cache.getVersion, serverVersion)
  const entry = cache.get(folder)
  const [failure, setFailure] = useState<Failure | null>(null)
  const failed = failure?.key === folder ? failure : null
  const ready = entry !== undefined || failed !== null

  // The folder on screen: this one once it has something to show, else the last one that did.
  const [shownKey, setShownKey] = useState<string | null>(null)
  if (ready && shownKey !== folder) setShownKey(folder)
  const [slowKey, setSlowKey] = useState<string | null>(null)
  if (ready && slowKey !== null) setSlowKey(null)

  const track = useCallback((key: string, request: Promise<unknown>, signal?: AbortSignal) => {
    request
      .then(() => {
        if (signal?.aborted) return
        setFailure(f => (f && f.key === key ? null : f))
      })
      .catch((e: unknown) => {
        if (isAbort(e) || signal?.aborted) return
        const status = e instanceof DocsApiError ? e.status : 0
        const offline = e instanceof DocsApiError && e.offline
        // A failed refetch of a folder still on screen keeps it, unless it's gone or storage is.
        if (status !== 404 && !offline && cache.get(key)) return
        setFailure({ key, error: errorText(e), status, offline })
      })
  }, [cache])

  useEffect(() => {
    const ctrl = new AbortController()
    if (!cache.isFresh(folder, REVALIDATE_AFTER)) track(folder, cache.load(folder), ctrl.signal)
    return () => ctrl.abort()
  }, [cache, folder, track])

  useEffect(() => {
    if (ready) return
    const t = setTimeout(() => setSlowKey(folder), SKELETON_DELAY)
    return () => clearTimeout(t)
  }, [ready, folder])

  const reload = useCallback(() => track(folder, cache.load(folder, { force: true })), [cache, folder, track])
  /** Local edits before the refetch lands (rename keeps its tile instead of flashing). */
  const patch = useCallback((fn: (items: DocItem[]) => DocItem[]) => cache.patch(folder, fn), [cache, folder])
  /** Optimistic additions (any folder; cached ones update now, the rest wait for their listing). */
  const addLocal = useCallback((items: DocItem[]) => cache.addLocal(items), [cache])

  const shown = ready ? folder : shownKey
  const shownListing = shown === null ? undefined : shown === folder ? entry : cache.get(shown)
  const shownFailure = shown !== null && failure?.key === shown ? failure : null
  const has = shownListing !== undefined || shownFailure !== null

  return {
    /** The folder whose contents are on screen (the previous one while `pending`; null before the first load). */
    shownFolder: has ? shown : null,
    items: shownFailure ? NO_ITEMS : shownListing?.items ?? NO_ITEMS,
    disk: shownListing?.disk ?? null,
    /** Nothing to show at all (first load). */
    loading: !has,
    /** The requested folder isn't here yet; the previous one stays on screen. */
    pending: !ready,
    /** …and it has taken longer than SKELETON_DELAY. */
    slow: !ready && slowKey === folder,
    error: shownFailure?.error ?? null,
    notFound: shownFailure?.status === 404,
    offline: shownFailure?.offline ?? false,
    reload,
    patch,
    addLocal,
  }
}

type SearchState = { key: string; items: DocItem[]; truncated: boolean; error: string | null }

/** Tree-wide name search, debounced; `seq` refetches after an edit. Empty query = idle. */
export function useDocSearch(query: string, seq: number) {
  const q = query.trim()
  const key = `${seq}\u0000${q}`
  const [state, setState] = useState<SearchState | null>(null)

  useEffect(() => {
    if (!q) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      searchAll(q, ctrl.signal)
        .then(r => setState({ key, items: r.items, truncated: r.truncated, error: null }))
        .catch(e => { if (!isAbort(e)) setState({ key, items: [], truncated: false, error: errorText(e) }) })
    }, 220)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [q, key])

  // While a refetch for the same text runs, keep showing the last answer for that text.
  const current = state && state.key.endsWith(`\u0000${q}`) ? state : null
  return {
    active: q.length > 0,
    items: q && current ? current.items : NO_ITEMS,
    truncated: Boolean(q && current?.truncated),
    error: q ? current?.error ?? null : null,
    loading: Boolean(q) && current === null,
  }
}

/** `/api/files/status` (online + disk); refetched with `seq` (after a failed list). */
export function useStorageStatus(seq: number) {
  const [status, setStatus] = useState<StorageStatus | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    storageStatus(ctrl.signal)
      .then(setStatus)
      .catch(e => {
        if (isAbort(e)) return
        // The route answers 503 with { offline: true } when the share isn't mounted.
        if (e instanceof DocsApiError && e.offline) setStatus({ online: false })
      })
    return () => ctrl.abort()
  }, [seq])
  return status
}

// --- per-browser prefs (view mode + sort), localStorage ------------------------------

export type ViewMode = 'grid' | 'list'
export interface DocPrefs { view: ViewMode; sort: Sort }

const PREFS_KEY = 'reel.documents.v1'
const DEFAULT_PREFS: DocPrefs = { view: 'grid', sort: DEFAULT_SORT }
const FIELDS: SortField[] = ['name', 'kind', 'modified', 'size']
const listeners = new Set<() => void>()
/** Last prefs set this session, for when localStorage is unavailable (private mode, blocked storage). */
let fallback = ''

function readRaw(): string {
  try { return window.localStorage.getItem(PREFS_KEY) ?? fallback } catch { return fallback }
}

function subscribePrefs(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => { if (e.key === PREFS_KEY) cb() }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage) }
}

function parsePrefs(raw: string): DocPrefs {
  if (!raw) return DEFAULT_PREFS
  try {
    const v = JSON.parse(raw) as Partial<{ view: unknown; sort: { field?: unknown; dir?: unknown } }>
    const view: ViewMode = v.view === 'list' ? 'list' : 'grid'
    const field = FIELDS.includes(v.sort?.field as SortField) ? (v.sort!.field as SortField) : DEFAULT_SORT.field
    const dir = v.sort?.dir === 'desc' ? 'desc' : v.sort?.dir === 'asc' ? 'asc' : DEFAULT_SORT.dir
    return { view, sort: { field, dir } }
  } catch {
    return DEFAULT_PREFS
  }
}

/** View mode and sort, remembered per browser (cross-tab via the storage event). Server snapshot = defaults. */
export function useDocPrefs() {
  const raw = useSyncExternalStore(subscribePrefs, readRaw, () => '')
  const prefs = useMemo(() => parsePrefs(raw), [raw])
  const update = useCallback((patch: Partial<DocPrefs>) => {
    const next = JSON.stringify({ ...parsePrefs(readRaw()), ...patch })
    fallback = next
    try { window.localStorage.setItem(PREFS_KEY, next) } catch { /* in-memory only this session */ }
    listeners.forEach(l => l())
  }, [])
  return { prefs, update }
}
