// Pure helpers behind the Documents view model: Finder selection rules and sorting.
// (Ported from GuardianPad's lib/selection.js and useDocumentsBrowser's comparator.)

import type { DocItem } from './api'
import { kindLabel } from './fileKinds'

export interface SelectionState { selected: ReadonlySet<string>; anchor: string | null }
export interface ClickMods { meta?: boolean; shift?: boolean }

export const EMPTY_SELECTION: SelectionState = { selected: new Set(), anchor: null }

/** Keys from a to b inclusive, in `ordered` order. Missing anchor → just b. */
export function rangeBetween(ordered: readonly string[], a: string | null, b: string): string[] {
  const end = ordered.indexOf(b)
  if (end === -1) return []
  const start = a == null ? -1 : ordered.indexOf(a)
  if (start === -1) return [b]
  const [lo, hi] = start <= end ? [start, end] : [end, start]
  return ordered.slice(lo, hi + 1)
}

/** The selection after a click: plain = only this, meta = toggle, shift = range from the anchor (meta+shift adds the range). */
export function applyClick(state: SelectionState, ordered: readonly string[], key: string, { meta = false, shift = false }: ClickMods = {}): SelectionState {
  if (shift) {
    const range = rangeBetween(ordered, state.anchor, key)
    const next = meta ? new Set([...state.selected, ...range]) : new Set(range)
    return { selected: next, anchor: state.anchor ?? key }
  }
  if (meta) {
    const next = new Set(state.selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return { selected: next, anchor: key }
  }
  return { selected: new Set([key]), anchor: key }
}

/** Drops keys that are no longer listed; returns the same object when nothing changed. */
export function pruneSelection(state: SelectionState, ordered: readonly string[]): SelectionState {
  const valid = new Set(ordered)
  const kept = [...state.selected].filter(k => valid.has(k))
  const anchor = state.anchor != null && valid.has(state.anchor) ? state.anchor : null
  if (kept.length === state.selected.size && anchor === state.anchor) return state
  return { selected: new Set(kept), anchor }
}

// --- sorting -------------------------------------------------------------------

export type SortField = 'name' | 'kind' | 'modified' | 'size'
export type SortDir = 'asc' | 'desc'
export interface Sort { field: SortField; dir: SortDir }

export const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'kind', label: 'Kind' },
  { value: 'modified', label: 'Date modified' },
  { value: 'size', label: 'Size' },
]

/** Newest and largest first reads better than A to Z for those two. */
export const DEFAULT_DIR: Record<SortField, SortDir> = { name: 'asc', kind: 'asc', modified: 'desc', size: 'desc' }
export const DEFAULT_SORT: Sort = { field: 'name', dir: 'asc' }

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function comparator(field: SortField, dir: SortDir): (a: DocItem, b: DocItem) => number {
  const sign = dir === 'desc' ? -1 : 1
  const byName = (a: DocItem, b: DocItem) => collator.compare(a.name, b.name)
  const primary: Record<SortField, (a: DocItem, b: DocItem) => number> = {
    name: byName,
    kind: (a, b) => collator.compare(kindLabel(a), kindLabel(b)),
    modified: (a, b) => a.modified - b.modified,
    size: (a, b) => a.size - b.size,
  }
  return (a, b) => sign * (primary[field](a, b) || byName(a, b))
}

/** Folders first, then files. Folders have no kind or size of their own, so those sorts order them by name. */
export function sortItems(items: readonly DocItem[], sort: Sort): DocItem[] {
  const cmp = comparator(sort.field, sort.dir)
  const folderCmp = sort.field === 'kind' || sort.field === 'size' ? comparator('name', 'asc') : cmp
  const dirs = items.filter(i => i.isDir).sort(folderCmp)
  const files = items.filter(i => !i.isDir).sort(cmp)
  return [...dirs, ...files]
}

/** Header click: same field reverses, a new field starts in its natural direction. */
export function toggleSort(sort: Sort, field: SortField): Sort {
  return sort.field === field ? { field, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: DEFAULT_DIR[field] }
}

/** A drop of `paths` into `target` is allowed when no folder goes into itself and something actually moves. */
export function canMoveInto(paths: readonly string[], dirs: ReadonlySet<string>, target: string): boolean {
  if (paths.length === 0) return false
  for (const p of paths) {
    if (dirs.has(p) && (target === p || target.startsWith(`${p}/`))) return false
  }
  return paths.some(p => {
    const i = p.lastIndexOf('/')
    return (i < 0 ? '' : p.slice(0, i)) !== target
  })
}

/** Leaves out items that sit inside another selected folder (deleting the folder covers them). */
export function topLevelOnly<T extends { path: string; isDir: boolean }>(items: readonly T[]): T[] {
  const dirs = items.filter(i => i.isDir).map(i => i.path)
  return items.filter(i => !dirs.some(d => d !== i.path && i.path.startsWith(`${d}/`)))
}
