'use client'

import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { ROOT_NAME, baseName, cleanFolder, parentOf, type DocItem } from './api'
import { DROP_ATTR } from './dnd'
import { folderCache } from './folderCache'
import { useDocPrefs, useDocSearch, useFolder, type ViewMode } from './hooks'
import {
  DEFAULT_DIR, EMPTY_SELECTION, pruneSelection, selectionReducer, sortItems, toggleSort as nextSort,
  type ClickMods, type SortField,
} from './selection'

const VIEWER_STATE = 'docsViewer'

function openedByPush(): boolean {
  const st: unknown = window.history.state
  return Boolean(st && typeof st === 'object' && (st as Record<string, unknown>)[VIEWER_STATE])
}

function urlWithViewer(path: string | null): string {
  const url = new URL(window.location.href)
  if (path) url.searchParams.set('view', path)
  else url.searchParams.delete('view')
  return `${url.pathname}${url.search}${url.hash}`
}

/** Grid columns = tiles sharing the first tile's row. */
function columnsOf(container: HTMLElement | null): number {
  const tiles = container?.querySelectorAll<HTMLElement>('[data-doc-key]') ?? []
  if (tiles.length < 2) return 1
  const top = tiles[0].offsetTop
  let n = 0
  for (const t of tiles) {
    if (t.offsetTop !== top) break
    n++
  }
  return Math.max(1, n)
}

const isTypingTarget = (el: EventTarget | null) =>
  el instanceof HTMLElement && Boolean(el.closest('input, textarea, select, [contenteditable="true"]'))

export interface Crumb { path: string; name: string }

/**
 * A folder change started here (a click, crumb or key); read once by the browser when that
 * folder is on screen. A folder change without one came from Back / Forward or a link.
 */
export interface NavIntent {
  /** The folder being opened. */
  to: string
  /** Started from the keyboard (focus goes to the folder's first item). */
  keyboard: boolean
}

/** Subfolders on screen prefetched per view, when the browser is idle. */
const IDLE_PREFETCH_MAX = 8

function whenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const h = window.requestIdleCallback(fn, { timeout: 1200 })
    return () => window.cancelIdleCallback(h)
  }
  const t = window.setTimeout(fn, 250)
  return () => window.clearTimeout(t)
}

/**
 * View model for the Documents browser (port of GuardianPad's useDocumentsBrowser):
 * folder from `?folder=` (History API pushState, so Back steps up), the open file from `?view=`
 * (History API, so Back closes the viewer), view mode + sort (localStorage), tree-wide
 * search, explicit selection mode (`selectionReducer`), the keyboard focus (`lead`, which
 * arrows move without selecting), rename target and keyboard handling.
 */
export function useDocumentsBrowser({ containerRef, storageOffline, onDelete }: {
  /** The listbox element (keyboard handling measures grid columns from it). */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** /api/files/status says the share isn't mounted (a 503 from the listing counts too). */
  storageOffline: boolean
  /** Delete / Backspace on a selection. */
  onDelete: (items: DocItem[]) => void
}) {
  const pathname = usePathname()
  const params = useSearchParams()
  const folder = cleanFolder(params.get('folder'))
  const viewPath = params.get('view')
  const data = useFolder(folder)
  const readOnly = storageOffline || data.offline
  const { prefs, update: updatePrefs } = useDocPrefs()
  const idPrefix = useId()

  const [search, setSearch] = useState('')
  const [searchSeq, setSearchSeq] = useState(0)
  const found = useDocSearch(search, searchSeq)
  const searching = found.active
  const refreshSearch = useCallback(() => setSearchSeq(n => n + 1), [])

  const [selState, dispatchSel] = useReducer(selectionReducer, EMPTY_SELECTION)
  const [lead, setLead] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  /** A keyboard navigation to this folder: its first item takes the focus once it's on screen. */
  const [focusFirstIn, setFocusFirstIn] = useState<string | null>(null)

  // A folder change (a click, Back, a pasted link) resets the per-folder view state.
  const [prevFolder, setPrevFolder] = useState(folder)
  if (prevFolder !== folder) {
    setPrevFolder(folder)
    dispatchSel({ type: 'exit' })
    setLead(null)
    setRenaming(null)
    setSearch('')
  }

  const items = useMemo(
    () => sortItems(searching ? found.items : data.items, prefs.sort),
    [searching, found.items, data.items, prefs.sort],
  )
  const visibleKeys = useMemo(() => items.map(i => i.path), [items])
  const itemsByKey = useMemo(() => new Map(items.map(i => [i.path, i])), [items])
  const files = useMemo(() => items.filter(i => !i.isDir), [items])
  const selection = useMemo(() => pruneSelection(selState, visibleKeys), [selState, visibleKeys])
  const selectedItems = useMemo(() => items.filter(i => selection.selected.has(i.path)), [items, selection])
  const leadKey = lead && itemsByKey.has(lead) ? lead : null

  if (focusFirstIn !== null && !data.pending && data.shownFolder === focusFirstIn && !searching) {
    setFocusFirstIn(null)
    if (visibleKeys.length) setLead(visibleKeys[0])
  }

  const crumbs = useMemo<Crumb[]>(() => {
    const parts = folder ? folder.split('/') : []
    return [{ path: '', name: ROOT_NAME }, ...parts.map((name, i) => ({ path: parts.slice(0, i + 1).join('/'), name }))]
  }, [folder])

  // --- navigation ----------------------------------------------------------------

  // Folder moves go through the History API (pushState), like the viewer's ?view=, never
  // router.push. Next syncs useSearchParams with pushState itself, so the page re-renders
  // without a server round trip, and its router state stays tied to the address bar. Mixing
  // router.push with the viewer's pushState could leave Next's saved tree for one folder
  // under another folder's URL; a later router.push (a crumb, or the rail's Documents link)
  // to a folder that tree already named was then silently dropped. Reads the *live* URL so a
  // stale render can't turn a click into a no-op.
  //
  // Scroll is ours on this page (manual restoration, see DocumentsBrowser): going up, Back
  // or Forward puts back where you were in that folder, going in shows the list's top.
  const intentRef = useRef<NavIntent | null>(null)
  /** The intent behind the folder now on screen, once (null: it wasn't opened from here). */
  const takeNavIntent = useCallback((shown: string): NavIntent | null => {
    const intent = intentRef.current
    if (!intent || intent.to !== shown) return null
    intentRef.current = null
    return intent
  }, [])

  useEffect(() => {
    const h = window.history
    const before = h.scrollRestoration
    h.scrollRestoration = 'manual'
    return () => { h.scrollRestoration = before }
  }, [])

  const enterFolder = useCallback((path: string, { keyboard = false }: { keyboard?: boolean } = {}) => {
    setSearch('')
    const url = new URL(window.location.href)
    const live = cleanFolder(url.searchParams.get('folder'))
    if (path === live && !url.searchParams.has('view')) return
    if (path !== live) {
      intentRef.current = { to: path, keyboard }
      if (keyboard) {
        setFocusFirstIn(path)
        containerRef.current?.focus({ preventScroll: true })
      }
    }
    url.searchParams.delete('view')
    if (path) url.searchParams.set('folder', path)
    else url.searchParams.delete('folder')
    window.history.pushState({}, '', `${pathname}${url.search}`)
  }, [pathname, containerRef])

  const goUp = useCallback((opts: { keyboard?: boolean } = {}) => {
    const live = cleanFolder(new URL(window.location.href).searchParams.get('folder'))
    if (!live) return
    enterFolder(parentOf(live), opts)
  }, [enterFolder])

  // --- prefetch --------------------------------------------------------------------

  /** A folder the user is about to open (hover, press, focus): fetch it now. */
  const prefetch = useCallback((path: string) => {
    if (!readOnly) folderCache.prefetch(path, 'high')
  }, [readOnly])

  // Once a folder is on screen: its parent (up is one click away), then, when the browser
  // is idle, the subfolders you can see (at most IDLE_PREFETCH_MAX; the cache runs two at once).
  const settled = !data.pending && !data.loading && data.error === null && !searching ? data.shownFolder : null
  useEffect(() => {
    if (settled === null || readOnly) return
    if (settled) folderCache.prefetch(parentOf(settled), 'low')
    const cancel = whenIdle(() => {
      const box = containerRef.current
      if (!box) return
      const bottom = window.innerHeight
      const paths: string[] = []
      for (const el of box.querySelectorAll<HTMLElement>(`[role="option"][${DROP_ATTR}]`)) {
        const r = el.getBoundingClientRect()
        if (r.bottom < 0 || r.top > bottom) continue
        const p = el.getAttribute(DROP_ATTR)
        if (p !== null) paths.push(p)
        if (paths.length >= IDLE_PREFETCH_MAX) break
      }
      for (const p of paths) folderCache.prefetch(p, 'low')
    })
    return () => {
      cancel()
      folderCache.cancelQueued('low')
    }
  }, [settled, readOnly, containerRef])

  const openViewer = useCallback((path: string) => {
    window.history.pushState({ [VIEWER_STATE]: true }, '', urlWithViewer(path))
  }, [])
  // Fresh state object each time: Next skips its useSearchParams sync for state it tagged itself.
  const goViewer = useCallback((path: string) => {
    window.history.replaceState(openedByPush() ? { [VIEWER_STATE]: true } : {}, '', urlWithViewer(path))
  }, [])
  const closeViewer = useCallback(() => {
    if (openedByPush()) window.history.back()
    else window.history.replaceState({}, '', urlWithViewer(null))
  }, [])

  const open = useCallback((item: DocItem | undefined, opts: { keyboard?: boolean } = {}) => {
    if (!item) return
    if (item.isDir) enterFolder(item.path, opts)
    else openViewer(item.path)
  }, [enterFolder, openViewer])

  // --- selection -----------------------------------------------------------------

  const selectMode = selection.mode
  /** A modifier click (⌘/Ctrl toggles, Shift ranges) or, in selection mode, a plain click. */
  const clickSelect = useCallback((key: string, mods: ClickMods = {}) => {
    dispatchSel({ type: 'click', key, ordered: visibleKeys, mods })
    setLead(key)
  }, [visibleKeys])
  const toggle = useCallback((key: string) => {
    dispatchSel({ type: 'toggle', key })
    setLead(key)
  }, [])
  /** Selection mode, with `key` selected (⋯ → Select) or nothing yet (toolbar Select). */
  const enterSelect = useCallback((key?: string) => {
    dispatchSel({ type: 'enter', key })
    if (key) setLead(key)
  }, [])
  const selectAll = useCallback(() => dispatchSel({ type: 'all', ordered: visibleKeys }), [visibleKeys])
  const exitSelect = useCallback(() => dispatchSel({ type: 'exit' }), [])
  const isSelected = useCallback((key: string) => selection.selected.has(key), [selection])

  // --- rename ----------------------------------------------------------------------

  const startRename = useCallback((key: string | null) => {
    if (readOnly || !key) return
    setLead(key)
    setRenaming(key)
  }, [readOnly])
  const cancelRename = useCallback(() => setRenaming(null), [])
  /** Focus (and optionally rename) a path that is about to appear (new folder, renamed item). */
  const reveal = useCallback((key: string, { rename = false } = {}) => {
    setLead(key)
    setRenaming(rename ? key : null)
  }, [])

  // --- sort / view -------------------------------------------------------------------

  const setSortField = useCallback((field: SortField) => {
    updatePrefs({ sort: prefs.sort.field === field ? prefs.sort : { field, dir: DEFAULT_DIR[field] } })
  }, [prefs.sort, updatePrefs])
  const setSortDir = useCallback((dir: 'asc' | 'desc') => updatePrefs({ sort: { ...prefs.sort, dir } }), [prefs.sort, updatePrefs])
  const toggleSort = useCallback((field: SortField) => updatePrefs({ sort: nextSort(prefs.sort, field) }), [prefs.sort, updatePrefs])
  const setViewMode = useCallback((view: ViewMode) => updatePrefs({ view }), [updatePrefs])

  // Keep the keyboard lead on screen; a folder under it is likely next, so fetch it.
  useEffect(() => {
    if (!leadKey) return
    const i = visibleKeys.indexOf(leadKey)
    if (i < 0) return
    document.getElementById(`${idPrefix}-${i}`)?.scrollIntoView({ block: 'nearest' })
    if (itemsByKey.get(leadKey)?.isDir && !readOnly) folderCache.prefetch(leadKey, 'high')
  }, [leadKey, visibleKeys, idPrefix, itemsByKey, readOnly])

  const optionId = useCallback((key: string) => {
    const i = visibleKeys.indexOf(key)
    return i < 0 ? undefined : `${idPrefix}-${i}`
  }, [visibleKeys, idPrefix])

  // --- keyboard ----------------------------------------------------------------------

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const container = containerRef.current
    const target = e.target as HTMLElement
    // Menus and inline inputs bubble here through the React tree.
    if (!container?.contains(target) || isTypingTarget(target)) return
    if (target !== container && target.closest('button, a, [role="menuitem"]')) return
    const mod = e.metaKey || e.ctrlKey
    const count = selection.selected.size
    const leadItem = leadKey ? itemsByKey.get(leadKey) : undefined

    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return }
    if (e.key === 'Escape') {
      if (selection.mode) { e.preventDefault(); exitSelect() }
      return
    }
    if (e.key === 'Enter' || (mod && e.key === 'ArrowDown')) {
      // Enter opens the focused item, in selection mode too (Space selects).
      if (leadItem) { e.preventDefault(); open(leadItem, { keyboard: true }) }
      return
    }
    if (e.key === 'F2') {
      if (leadItem) { e.preventDefault(); startRename(leadItem.path) }
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (readOnly) return
      if (selection.mode && count) { e.preventDefault(); onDelete(selectedItems) }
      else if (!selection.mode && leadItem) { e.preventDefault(); onDelete([leadItem]) }
      return
    }
    if (mod && e.key === 'ArrowUp') { e.preventDefault(); goUp({ keyboard: true }); return }
    if (e.key === ' ' && leadKey) { e.preventDefault(); toggle(leadKey); return }

    const grid = prefs.view === 'grid'
    const cols = grid ? columnsOf(container) : 1
    const step = ({ ArrowDown: cols, ArrowUp: -cols, ArrowRight: grid ? 1 : 0, ArrowLeft: grid ? -1 : 0, Home: -Infinity, End: Infinity } as Record<string, number>)[e.key]
    if (!step || !visibleKeys.length) return
    e.preventDefault()
    const from = leadKey ? visibleKeys.indexOf(leadKey) : -1
    const next = from === -1
      ? (step > 0 ? 0 : visibleKeys.length - 1)
      : Math.min(visibleKeys.length - 1, Math.max(0, from + step))
    const key = visibleKeys[next]
    // Arrows move focus only; Shift+arrows extend a selection (and enter selection mode).
    if (e.shiftKey) clickSelect(key, { shift: true })
    else setLead(key)
  }, [containerRef, selection, itemsByKey, selectAll, exitSelect, open, selectedItems, startRename, readOnly, onDelete, goUp, leadKey, toggle, prefs.view, visibleKeys, clickSelect])

  return {
    readOnly,
    folder,
    folderName: crumbs[crumbs.length - 1].name,
    /** The folder whose contents are on screen (lags `folder` while an uncached one loads). */
    shownFolder: data.shownFolder,
    shownName: data.shownFolder ? baseName(data.shownFolder) : ROOT_NAME,
    crumbs,
    data,
    items,
    itemsByKey,
    files,
    // search
    search,
    setSearch,
    searching,
    searchLoading: found.loading,
    searchError: found.error,
    searchTruncated: found.truncated,
    refreshSearch,
    // view
    viewMode: prefs.view,
    setViewMode,
    sort: prefs.sort,
    setSortField,
    setSortDir,
    toggleSort,
    // navigation
    enterFolder,
    goUp,
    open,
    prefetch,
    takeNavIntent,
    viewPath,
    openViewer,
    goViewer,
    closeViewer,
    // selection
    selectMode,
    selectedKeys: selection.selected,
    selectedItems,
    selectedCount: selection.selected.size,
    isSelected,
    clickSelect,
    toggle,
    enterSelect,
    selectAll,
    exitSelect,
    lead: leadKey,
    setLead,
    optionId,
    // rename
    renaming,
    startRename,
    cancelRename,
    reveal,
    onKeyDown,
  }
}

export type DocumentsBrowserModel = ReturnType<typeof useDocumentsBrowser>
