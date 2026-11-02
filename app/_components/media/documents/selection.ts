// Pure helpers behind the Documents view model: Finder selection rules and sorting.
// (Ported from GuardianPad's lib/selection.js and useDocumentsBrowser's comparator.)

import type { DocItem } from './api'
import { kindLabel } from './fileKinds'

export interface SelectionState {
  /** Selection mode: circles on every item, plain clicks toggle instead of opening. */
  mode: boolean
  selected: ReadonlySet<string>
  anchor: string | null
}
export interface ClickMods { meta?: boolean; shift?: boolean }

export const EMPTY_SELECTION: SelectionState = { mode: false, selected: new Set(), anchor: null }

/** Keys from a to b inclusive, in `ordered` order. Missing anchor → just b. */
export function rangeBetween(ordered: readonly string[], a: string | null, b: string): string[] {
  const end = ordered.indexOf(b)
  if (end === -1) return []
  const start = a == null ? -1 : ordered.indexOf(a)
  if (start === -1) return [b]
  const [lo, hi] = start <= end ? [start, end] : [end, start]
  return ordered.slice(lo, hi + 1)
}

/**
 * Explicit selection. A plain click outside selection mode opens the item and never
 * reaches this reducer; everything that selects goes through it:
 *  - `enter`: the ⋯ menu's Select (with that item) or the toolbar's Select (nothing yet);
 *  - `click`: inside selection mode a plain click toggles; ⌘/Ctrl-click toggles and Shift-click
 *    adds the range from the anchor, both also entering selection mode from outside (power
 *    shortcuts); Space on the focused item is a toggle;
 *  - `all` (Select all / ⌘A), `exit` (Done, Escape, after Move/Delete), `prune` (items left).
 */
export type SelectionAction =
  | { type: 'enter'; key?: string }
  | { type: 'click'; key: string; ordered: readonly string[]; mods?: ClickMods }
  | { type: 'toggle'; key: string }
  | { type: 'all'; ordered: readonly string[] }
  | { type: 'exit' }
  | { type: 'prune'; ordered: readonly string[] }

export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'enter': {
      if (action.key == null) return state.mode ? state : { mode: true, selected: new Set(), anchor: null }
      const selected = new Set(state.mode ? state.selected : [])
      selected.add(action.key)
      return { mode: true, selected, anchor: action.key }
    }
    case 'toggle': {
      const selected = new Set(state.mode ? state.selected : [])
      if (selected.has(action.key)) selected.delete(action.key)
      else selected.add(action.key)
      return { mode: true, selected, anchor: action.key }
    }
    case 'click': {
      const { key, ordered, mods = {} } = action
      const base = state.mode ? state.selected : new Set<string>()
      if (mods.shift) {
        const anchor = state.mode ? state.anchor : null
        return { mode: true, selected: new Set([...base, ...rangeBetween(ordered, anchor, key)]), anchor: anchor ?? key }
      }
      if (mods.meta || state.mode) return selectionReducer(state, { type: 'toggle', key })
      // A plain click outside selection mode opens; selection is untouched.
      return state
    }
    case 'all':
      return { mode: true, selected: new Set(action.ordered), anchor: state.anchor ?? action.ordered[0] ?? null }
    case 'exit':
      return state.mode || state.selected.size ? EMPTY_SELECTION : state
    case 'prune':
      return pruneSelection(state, action.ordered)
  }
}

/** Drops keys that are no longer listed; returns the same object when nothing changed. */
export function pruneSelection(state: SelectionState, ordered: readonly string[]): SelectionState {
  const valid = new Set(ordered)
  const kept = [...state.selected].filter(k => valid.has(k))
  const anchor = state.anchor != null && valid.has(state.anchor) ? state.anchor : null
  if (kept.length === state.selected.size && anchor === state.anchor) return state
  return { mode: state.mode, selected: new Set(kept), anchor }
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
