'use client'

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ROOT_NAME, cleanFolder, type DocItem } from './api'
import { useDocPrefs, useDocSearch, useFolder, type ViewMode } from './hooks'
import {
  DEFAULT_DIR, EMPTY_SELECTION, applyClick, pruneSelection, sortItems, toggleSort as nextSort,
  type ClickMods, type SelectionState, type SortField,
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
 * View model for the Documents browser (port of GuardianPad's useDocumentsBrowser):
 * folder from `?folder=` (router.push, so Back steps up), the open file from `?view=`
 * (History API, so Back closes the viewer), view mode + sort (localStorage), tree-wide
 * search, Finder selection, rename target and keyboard handling.
 */
export function useDocumentsBrowser({ containerRef, storageOffline, onDelete }: {
  /** The listbox element (keyboard handling measures grid columns from it). */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** /api/files/status says the share isn't mounted (a 503 from the listing counts too). */
  storageOffline: boolean
  /** Delete / Backspace on a selection. */
  onDelete: (items: DocItem[]) => void
}) {
  const router = useRouter()
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

  const [selState, setSelState] = useState<SelectionState>(EMPTY_SELECTION)
  const [lead, setLead] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)

  // A folder change (a click, Back, a pasted link) resets the per-folder view state.
  const [prevFolder, setPrevFolder] = useState(folder)
  if (prevFolder !== folder) {
    setPrevFolder(folder)
    setSelState(EMPTY_SELECTION)
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

  const crumbs = useMemo<Crumb[]>(() => {
    const parts = folder ? folder.split('/') : []
    return [{ path: '', name: ROOT_NAME }, ...parts.map((name, i) => ({ path: parts.slice(0, i + 1).join('/'), name }))]
  }, [folder])

  // --- navigation ----------------------------------------------------------------

  const urlFor = useCallback((path: string) => {
    const next = new URLSearchParams(params.toString())
    next.delete('view')
    if (path) next.set('folder', path)
    else next.delete('folder')
    const qs = next.toString()
    return `${pathname}${qs ? `?${qs}` : ''}`
  }, [params, pathname])

  const enterFolder = useCallback((path: string) => {
    setSearch('')
    if (path === folder) return
    router.push(urlFor(path))
  }, [folder, router, urlFor])

  const goUp = useCallback(() => {
    if (!folder) return
    const i = folder.lastIndexOf('/')
    enterFolder(i < 0 ? '' : folder.slice(0, i))
  }, [folder, enterFolder])

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

  const open = useCallback((item: DocItem | undefined) => {
    if (!item) return
    if (item.isDir) enterFolder(item.path)
    else openViewer(item.path)
  }, [enterFolder, openViewer])

  // --- selection -----------------------------------------------------------------

  const select = useCallback((key: string, mods: ClickMods = {}) => {
    setSelState(s => applyClick(pruneSelection(s, visibleKeys), visibleKeys, key, mods))
    setLead(key)
  }, [visibleKeys])
  const selectOnly = useCallback((key: string) => {
    setSelState({ selected: new Set([key]), anchor: key })
    setLead(key)
  }, [])
  const toggle = useCallback((key: string, range = false) => select(key, { meta: true, shift: range }), [select])
  const selectAll = useCallback(() => {
    setSelState(s => ({ selected: new Set(visibleKeys), anchor: s.anchor ?? visibleKeys[0] ?? null }))
  }, [visibleKeys])
  const clearSelection = useCallback(() => {
    setSelState(EMPTY_SELECTION)
    setLead(null)
  }, [])
  const isSelected = useCallback((key: string) => selection.selected.has(key), [selection])

  // --- rename ----------------------------------------------------------------------

  const startRename = useCallback((key: string | null) => {
    if (readOnly || !key) return
    selectOnly(key)
    setRenaming(key)
  }, [readOnly, selectOnly])
  const cancelRename = useCallback(() => setRenaming(null), [])
  /** Select (and optionally rename) a path that is about to appear (new folder, renamed item). */
  const reveal = useCallback((key: string, { rename = false } = {}) => {
    setSelState({ selected: new Set([key]), anchor: key })
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

  // Keep the keyboard lead on screen.
  useEffect(() => {
    if (!leadKey) return
    const i = visibleKeys.indexOf(leadKey)
    if (i < 0) return
    document.getElementById(`${idPrefix}-${i}`)?.scrollIntoView({ block: 'nearest' })
  }, [leadKey, visibleKeys, idPrefix])

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

    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return }
    if (e.key === 'Escape') {
      if (count) { e.preventDefault(); clearSelection() }
      return
    }
    if (e.key === 'Enter' || (mod && e.key === 'ArrowDown')) {
      if (count === 1) {
        e.preventDefault()
        // Enter opens (the spec's keyboard model); F2 renames.
        open(selectedItems[0])
      }
      return
    }
    if (e.key === 'F2') {
      if (count === 1) { e.preventDefault(); startRename(selectedItems[0].path) }
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!readOnly && count) { e.preventDefault(); onDelete(selectedItems) }
      return
    }
    if (mod && e.key === 'ArrowUp') { e.preventDefault(); goUp(); return }
    if (e.key === ' ' && leadKey) { e.preventDefault(); select(leadKey, { meta: true }); return }

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
    if (e.shiftKey) select(key, { shift: true })
    else selectOnly(key)
  }, [containerRef, selection, selectAll, clearSelection, open, selectedItems, startRename, readOnly, onDelete, goUp, leadKey, select, prefs.view, visibleKeys, selectOnly])

  return {
    readOnly,
    folder,
    folderName: crumbs[crumbs.length - 1].name,
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
    viewPath,
    openViewer,
    goViewer,
    closeViewer,
    // selection
    selectedKeys: selection.selected,
    selectedItems,
    selectedCount: selection.selected.size,
    isSelected,
    select,
    selectOnly,
    toggle,
    selectAll,
    clearSelection,
    lead: leadKey,
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
