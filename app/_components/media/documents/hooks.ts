'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  DocsApiError, errorText, isAbort, listFolder, searchAll, storageStatus,
  type DiskInfo, type DocItem, type StorageStatus,
} from './api'
import { DEFAULT_SORT, type Sort, type SortField } from './selection'
import { mergeListing, upsertItems, type PendingItem } from './uploadPlan'

const NO_ITEMS: DocItem[] = []

type FolderState = {
  /** The folder these items belong to. */
  key: string
  items: DocItem[]
  disk: DiskInfo | null
  error: string | null
  status: number
  offline: boolean
}

/**
 * One folder's listing, stale-while-revalidate. State is keyed by the folder, so a slow
 * answer for the folder you just left never shows under the new one, and only a folder
 * change shows the loading state. `reload()` refetches in place: the current items stay
 * on screen until the new listing replaces them (a failed background refetch keeps them,
 * unless the folder is gone or storage went offline). `addLocal()` patches the listing
 * optimistically (stored uploads, folders a drop created); those entries survive a
 * refetch that started before they existed, so a refresh never takes an item away.
 */
export function useFolder(folder: string) {
  const [state, setState] = useState<FolderState | null>(null)
  const [seq, setSeq] = useState(0)
  const pending = useRef<PendingItem[]>([])

  useEffect(() => {
    const ctrl = new AbortController()
    const startedAt = Date.now()
    listFolder(folder, ctrl.signal)
      .then(({ items, disk }) => {
        if (ctrl.signal.aborted) return
        const merged = mergeListing(items, pending.current.filter(p => p.item.parent === folder), startedAt)
        pending.current = [...pending.current.filter(p => p.item.parent !== folder), ...merged.pending]
        setState({ key: folder, items: merged.items, disk, error: null, status: 200, offline: false })
      })
      .catch(e => {
        if (isAbort(e) || ctrl.signal.aborted) return
        const status = e instanceof DocsApiError ? e.status : 0
        const offline = e instanceof DocsApiError && e.offline
        setState(s => (s && s.key === folder && !s.error && status !== 404 && !offline
          ? s
          : { key: folder, items: [], disk: null, error: errorText(e), status, offline }))
      })
    return () => ctrl.abort()
  }, [folder, seq])

  const current = state?.key === folder ? state : null
  const reload = useCallback(() => setSeq(n => n + 1), [])
  /** Local edits before the refetch lands (rename keeps its tile instead of flashing). */
  const patch = useCallback((fn: (items: DocItem[]) => DocItem[]) => {
    setState(s => (s && s.key === folder ? { ...s, items: fn(s.items) } : s))
  }, [folder])
  /** Optimistic additions (any folder; only this folder's show now, the rest wait for their listing). */
  const addLocal = useCallback((items: DocItem[]) => {
    if (items.length === 0) return
    const at = Date.now()
    pending.current = [...pending.current.filter(p => !items.some(i => i.path === p.item.path)), ...items.map(item => ({ item, at }))]
    setState(s => {
      if (!s || s.error) return s
      const mine = items.filter(i => i.parent === s.key)
      return mine.length ? { ...s, items: upsertItems(s.items, mine) } : s
    })
  }, [])

  return {
    items: current?.items ?? NO_ITEMS,
    disk: current?.disk ?? null,
    loading: current === null,
    error: current?.error ?? null,
    notFound: current?.status === 404,
    offline: current?.offline ?? false,
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
