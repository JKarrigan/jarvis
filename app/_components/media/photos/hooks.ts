'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'next/navigation'
import { normalizeTag } from '@/lib/photos/tags'
import {
  errorText, fetchJson, isAbort, PhotosApiError, type Album, type PhotoItem, type PhotoPage, type PhotoSummary, type PhotoTagCount,
} from './api'

const PAGE_SIZE = 120
const NO_ITEMS: PhotoItem[] = []

type PagesState = {
  /** The request (endpoint + query) these items belong to. */
  key: string
  items: PhotoItem[]
  cursor: string | null
  error: string | null
  offline: boolean
}

/**
 * Keyset-paged photo list (`/api/photos` or `/api/photos/trash`). State is keyed by the
 * request, so a slow response for an old filter can never show under a new one, and a
 * changed filter shows the loading state rather than the previous filter's items.
 * `reload()` refetches in place (same key, keeps items on screen) and covers as many
 * items as are loaded, so a refresh after an upload doesn't collapse a deep scroll.
 */
export function usePhotoPages(endpoint: string, query: string) {
  const key = `${endpoint}?${query}`
  const [state, setState] = useState<PagesState | null>(null)
  const [reloadSeq, setReloadSeq] = useState(0)
  const [loadingMore, setLoadingMore] = useState<string | null>(null)
  const loadedRef = useRef(0)
  const inflight = useRef<AbortController | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    inflight.current?.abort()
    const limit = Math.min(500, Math.max(PAGE_SIZE, loadedRef.current))
    const sep = query ? '&' : ''
    fetchJson<PhotoPage>(`${endpoint}?${query}${sep}limit=${limit}`, { signal: ctrl.signal })
      .then(page => setState({ key, items: page.items, cursor: page.nextCursor, error: null, offline: false }))
      .catch(e => {
        if (isAbort(e)) return
        setState({ key, items: [], cursor: null, error: errorText(e), offline: e instanceof PhotosApiError && e.status === 503 })
      })
    return () => ctrl.abort()
  }, [endpoint, query, key, reloadSeq])

  const current = state?.key === key ? state : null
  useEffect(() => { loadedRef.current = current?.items.length ?? 0 }, [current])

  const loadMore = useCallback(() => {
    if (!current?.cursor || loadingMore === key) return
    const ctrl = new AbortController()
    inflight.current = ctrl
    setLoadingMore(key)
    const sep = query ? '&' : ''
    fetchJson<PhotoPage>(`${endpoint}?${query}${sep}limit=${PAGE_SIZE}&cursor=${encodeURIComponent(current.cursor)}`, { signal: ctrl.signal })
      .then(page => {
        setState(s => {
          if (!s || s.key !== key) return s
          const seen = new Set(s.items.map(i => i.id))
          return { ...s, items: [...s.items, ...page.items.filter(i => !seen.has(i.id))], cursor: page.nextCursor }
        })
      })
      .catch(e => {
        if (isAbort(e)) return
        setState(s => (s && s.key === key ? { ...s, error: errorText(e) } : s))
      })
      .finally(() => setLoadingMore(k => (k === key ? null : k)))
  }, [current, endpoint, query, key, loadingMore])

  const reload = useCallback(() => setReloadSeq(n => n + 1), [])

  /** Local edits (optimistic favorite, removal after delete) on the current list. */
  const patchItems = useCallback((ids: Iterable<string>, patch: Partial<PhotoItem>) => {
    const set = new Set(ids)
    setState(s => (s && s.key === key ? { ...s, items: s.items.map(i => (set.has(i.id) ? { ...i, ...patch } : i)) } : s))
  }, [key])
  /** Per-item local edit (bulk tag changes differ per item). */
  const updateItems = useCallback((ids: Iterable<string>, fn: (item: PhotoItem) => PhotoItem) => {
    const set = new Set(ids)
    setState(s => (s && s.key === key ? { ...s, items: s.items.map(i => (set.has(i.id) ? fn(i) : i)) } : s))
  }, [key])
  const removeItems = useCallback((ids: Iterable<string>) => {
    const set = new Set(ids)
    setState(s => (s && s.key === key ? { ...s, items: s.items.filter(i => !set.has(i.id)) } : s))
  }, [key])

  return {
    items: current?.items ?? NO_ITEMS,
    loading: current === null,
    loadingMore: loadingMore === key,
    hasMore: Boolean(current?.cursor),
    error: current?.error ?? null,
    offline: current?.offline ?? false,
    loadMore,
    reload,
    patchItems,
    updateItems,
    removeItems,
  }
}

/** `/api/photos/summary`, refetchable. */
export function useSummary() {
  const [summary, setSummary] = useState<PhotoSummary | null>(null)
  const [seq, setSeq] = useState(0)
  useEffect(() => {
    const ctrl = new AbortController()
    fetchJson<PhotoSummary>('/api/photos/summary', { signal: ctrl.signal })
      .then(setSummary)
      .catch(e => { if (!isAbort(e)) console.warn('[photos] summary failed', e) })
    return () => ctrl.abort()
  }, [seq])
  const reload = useCallback(() => setSeq(n => n + 1), [])
  return { summary, reload }
}

/** `/api/photos/albums`; `enabled` lets sheets fetch only while open. */
export function useAlbums(enabled = true) {
  const [state, setState] = useState<{ seq: number; albums: Album[]; error: string | null } | null>(null)
  const [seq, setSeq] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const ctrl = new AbortController()
    fetchJson<{ albums: Album[] }>('/api/photos/albums', { signal: ctrl.signal })
      .then(d => setState({ seq, albums: d.albums, error: null }))
      .catch(e => { if (!isAbort(e)) setState({ seq, albums: [], error: errorText(e) }) })
    return () => ctrl.abort()
  }, [enabled, seq])
  const reload = useCallback(() => setSeq(n => n + 1), [])
  return {
    albums: state?.albums ?? null,
    error: state?.error ?? null,
    /** True until the first response (or after reload, until it lands). */
    loading: !state || state.seq !== seq,
    reload,
  }
}

/** `/api/photos/tags` (tag + item count, most used first); `enabled` fetches only while a menu/sheet is open. */
export function useTagCounts(enabled = true) {
  const [state, setState] = useState<{ seq: number; tags: PhotoTagCount[]; error: string | null } | null>(null)
  const [seq, setSeq] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const ctrl = new AbortController()
    fetchJson<PhotoTagCount[]>('/api/photos/tags', { signal: ctrl.signal })
      .then(tags => setState({ seq, tags, error: null }))
      .catch(e => { if (!isAbort(e)) setState({ seq, tags: [], error: errorText(e) }) })
    return () => ctrl.abort()
  }, [enabled, seq])
  const reload = useCallback(() => setSeq(n => n + 1), [])
  return {
    /** Last response (kept while a reload is in flight), null before the first. */
    tags: state?.tags ?? null,
    error: state?.error ?? null,
    loading: !state || state.seq !== seq,
    reload,
  }
}

/**
 * The timeline's tag filter lives in the URL (`?tag=`) so it survives reload and Back.
 * Picking a tag pushes a history entry (and closes any open viewer); same History API
 * approach as the viewer, with a fresh state object so Next syncs useSearchParams.
 */
export function useTagParam() {
  const params = useSearchParams()
  const tag = normalizeTag(params.get('tag'))
  const setTag = useCallback((next: string | null) => {
    const url = new URL(window.location.href)
    if (next) url.searchParams.set('tag', next)
    else url.searchParams.delete('tag')
    url.searchParams.delete('v')
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])
  return { tag, setTag }
}

const VIEWER_STATE = 'photosViewer'

function openedByPush(): boolean {
  const st: unknown = window.history.state
  return Boolean(st && typeof st === 'object' && (st as Record<string, unknown>)[VIEWER_STATE])
}

function urlWithViewer(id: string | null): string {
  const url = new URL(window.location.href)
  if (id) url.searchParams.set('v', id)
  else url.searchParams.delete('v')
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * The open viewer item lives in the URL (`?v=<id>`) so Back closes it and the link is
 * shareable. Uses the History API directly (Next.js syncs it into useSearchParams) so
 * opening a photo never refetches the page's server components. Opening pushes one
 * entry; moving between photos replaces it; closing pops it again (or strips `v` when
 * the page was loaded with `?v=` already).
 */
export function useViewerParam() {
  const params = useSearchParams()
  const raw = params.get('v')
  const viewerId = raw && /^[0-9a-f]{16}$/.test(raw) ? raw : null

  const open = useCallback((id: string) => {
    window.history.pushState({ [VIEWER_STATE]: true }, '', urlWithViewer(id))
  }, [])
  // Always pass a fresh state object: Next.js skips its router sync for state objects that
  // already carry its internal markers (i.e. passing `history.state` back would not update
  // useSearchParams). Our own flag is kept so close() knows whether it may go Back.
  const go = useCallback((id: string) => {
    window.history.replaceState(openedByPush() ? { [VIEWER_STATE]: true } : {}, '', urlWithViewer(id))
  }, [])
  const close = useCallback(() => {
    if (openedByPush()) window.history.back()
    else window.history.replaceState({}, '', urlWithViewer(null))
  }, [])
  return { viewerId, open, go, close }
}

/** Locks page scroll while mounted (restores the previous value). */
export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [active])
}

/** Tiny transient status line (role=status) for action results. */
export function useToast() {
  const [toast, setToast] = useState<{ id: number; text: string; tone: 'ok' | 'error' } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ id: Date.now(), text, tone })
    timer.current = setTimeout(() => setToast(null), 3200)
  }, [])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return useMemo(() => ({ toast, show }), [toast, show])
}

/** Selection set + range anchor for a grid of items. */
export function useSelection(items: PhotoItem[]) {
  const [active, setActive] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const anchor = useRef<string | null>(null)

  const toggle = useCallback((id: string, range = false) => {
    setSelected(prev => {
      const next = new Set(prev)
      const from = anchor.current ? items.findIndex(i => i.id === anchor.current) : -1
      const to = items.findIndex(i => i.id === id)
      if (range && from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from]
        for (let i = a; i <= b; i++) next.add(items[i].id)
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    anchor.current = id
    setActive(true)
  }, [items])

  const start = useCallback(() => setActive(true), [])
  const clear = useCallback(() => { setActive(false); setSelected(new Set()); anchor.current = null }, [])
  const selectAll = useCallback(() => setSelected(new Set(items.map(i => i.id))), [items])
  const drop = useCallback((ids: Iterable<string>) => {
    const gone = new Set(ids)
    setSelected(prev => new Set([...prev].filter(id => !gone.has(id))))
  }, [])

  return { active, selected, toggle, start, clear, selectAll, drop }
}

const DESKTOP_MQ = '(min-width: 768px)'
function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_MQ)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** Matches Tailwind `md` (where MediaRail becomes the side rail). False during SSR. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_MQ).matches, () => false)
}

const noopSubscribe = () => () => {}
/** True only after hydration — for UI that depends on browser APIs (canPlayType, history). */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}
