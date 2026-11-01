'use client'

import { useEffect, useRef } from 'react'
import { formatBytes, formatModified, pathLabel, type DocItem } from './api'
import { DROP_ATTR } from './dnd'
import { kindLabel } from './fileKinds'
import { ItemIcon } from './ItemIcon'
import { ItemName, type RenameResult } from './ItemName'
import type { DocumentsBrowserModel } from './useDocumentsBrowser'
import type { Sort, SortField } from './selection'
import { CheckboxIcon, MoreIcon } from '../photos/icons'
import { ArrowDownIcon, ArrowUpIcon } from './icons'

/** Everything a tile or row needs from the browser, passed as one object. */
export interface ItemEnv {
  b: DocumentsBrowserModel
  readOnly: boolean
  canDrag: boolean
  dragging: ReadonlySet<string> | null
  over: string | null
  onDragStart: (e: React.DragEvent, item: DocItem) => void
  onDragEnd: () => void
  /** Opens the shared action menu for `item` at a point (right-click) or under an element (⋯). */
  onMenu: (item: DocItem, at: { x: number; y: number } | HTMLElement) => void
  onCommitRename: (item: DocItem, name: string) => Promise<RenameResult>
}

/**
 * Finder clicks: click selects (⌘/Ctrl toggles, Shift ranges), double-click opens, a
 * click on the name of the lone selected item renames. A touch tap opens, or toggles
 * while something is selected.
 */
function useItemPointer(item: DocItem, env: ItemEnv) {
  const pointerType = useRef('mouse')
  const wasSoleSelected = useRef(false)
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { b, readOnly } = env
  useEffect(() => () => { if (renameTimer.current) clearTimeout(renameTimer.current) }, [])

  return {
    onPointerDown: (e: React.PointerEvent) => {
      pointerType.current = e.pointerType || 'mouse'
      wasSoleSelected.current = b.isSelected(item.path) && b.selectedCount === 1
    },
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation()
      const mods = { meta: e.metaKey || e.ctrlKey, shift: e.shiftKey }
      if (pointerType.current === 'touch' && !mods.meta && !mods.shift) {
        if (b.selectedCount > 0) b.toggle(item.path)
        else b.open(item)
        return
      }
      if (e.detail > 1) return
      const onName = e.target instanceof Element && Boolean(e.target.closest('[data-item-name]'))
      if (onName && wasSoleSelected.current && !readOnly && !mods.meta && !mods.shift) {
        if (renameTimer.current) clearTimeout(renameTimer.current)
        renameTimer.current = setTimeout(() => b.startRename(item.path), 500)
        return
      }
      b.select(item.path, mods)
    },
    onDoubleClick: (e: React.MouseEvent) => {
      e.stopPropagation()
      if (renameTimer.current) clearTimeout(renameTimer.current)
      if (pointerType.current === 'touch') return
      b.open(item)
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!b.isSelected(item.path)) b.selectOnly(item.path)
      env.onMenu(item, { x: e.clientX, y: e.clientY })
    },
  }
}

/** Select circle (as on the Photos tiles) so touch can select without modifiers. */
function SelectCircle({ item, env, selected, className }: { item: DocItem; env: ItemEnv; selected: boolean; className: string }) {
  const anySelected = env.b.selectedCount > 0
  return (
    <span
      aria-hidden="true"
      onClick={e => { e.stopPropagation(); env.b.toggle(item.path, e.shiftKey) }}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      className={`grid h-8 w-8 place-items-center rounded-full transition ${selected ? 'text-accent' : 'text-white/80 hover:text-white'} ${
        selected || anySelected ? '' : 'opacity-60 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100'
      } ${className}`}
    >
      <CheckboxIcon checked={selected} className="h-[22px] w-[22px]" />
    </span>
  )
}

function MoreButton({ item, env, className }: { item: DocItem; env: ItemEnv; className: string }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Actions for ${item.name}`}
      aria-haspopup="menu"
      onClick={e => {
        e.stopPropagation()
        if (!env.b.isSelected(item.path)) env.b.selectOnly(item.path)
        env.onMenu(item, e.currentTarget)
      }}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      className={`grid h-8 w-8 place-items-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white ${className}`}
    >
      <MoreIcon className="h-[18px] w-[18px]" />
    </button>
  )
}

function itemProps(item: DocItem, env: ItemEnv, editing: boolean) {
  const { b } = env
  const draggable = env.canDrag && !env.readOnly && !editing
  return {
    id: b.optionId(item.path),
    role: 'option' as const,
    'aria-selected': b.isSelected(item.path),
    'data-doc-key': item.path,
    ...(item.isDir ? { [DROP_ATTR]: item.path } : {}),
    draggable,
    onDragStart: draggable ? (e: React.DragEvent) => env.onDragStart(e, item) : undefined,
    onDragEnd: draggable ? env.onDragEnd : undefined,
  }
}

/** One grid tile: icon well, Finder-style name (selected = accent pill), select circle, hover ⋯. */
export function ItemTile({ item, env }: { item: DocItem; env: ItemEnv }) {
  const { b } = env
  const selected = b.isSelected(item.path)
  const editing = b.renaming === item.path
  const isOver = env.over === item.path
  const pointer = useItemPointer(item, env)
  return (
    <div
      {...itemProps(item, env, editing)}
      {...pointer}
      className={`group relative flex min-w-0 select-none flex-col items-center gap-1.5 rounded-[14px] px-1.5 pb-2 pt-2 outline-none transition-colors [-webkit-touch-callout:none] ${
        isOver ? 'bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]' : selected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.045]'
      } ${b.lead === item.path ? 'focus-lead group-focus-visible/list:ring-2 group-focus-visible/list:ring-white/45' : ''} ${env.dragging?.has(item.path) ? 'opacity-40' : ''}`}
    >
      <div className="relative grid h-[92px] w-full place-items-center">
        <ItemIcon item={item} />
      </div>
      <div className="flex w-full min-w-0 justify-center">
        <ItemName
          item={item}
          editing={editing}
          maxChars={22}
          onCommit={name => env.onCommitRename(item, name)}
          onCancel={b.cancelRename}
          inputClassName="py-0.5 text-center text-[12.5px] leading-[1.3]"
          className={`line-clamp-2 max-w-full px-1.5 py-px text-center text-[12.5px] font-medium leading-[1.3] [overflow-wrap:anywhere] ${
            selected ? 'rounded-[6px] bg-[var(--accent)] text-ink-on-accent' : 'text-white/85'
          }`}
        />
      </div>
      {b.searching && <span className="-mt-1 max-w-full truncate text-[11px] text-white/45" title={pathLabel(item.parent)}>{pathLabel(item.parent)}</span>}
      {!item.isDir && !b.searching && <span className="-mt-1 text-[11px] tabular-nums text-white/40">{formatBytes(item.size)}</span>}
      {item.isDir && !b.searching && <span className="-mt-1 text-[11px] tabular-nums text-white/40">{item.childCount === 0 ? 'Empty' : `${item.childCount} item${item.childCount === 1 ? '' : 's'}`}</span>}
      <SelectCircle item={item} env={env} selected={selected} className="absolute left-1 top-1" />
      {!editing && <MoreButton item={item} env={env} className="absolute right-1 top-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-[.focus-lead]:opacity-100 [@media(hover:hover)]:group-aria-selected:opacity-100" />}
    </div>
  )
}

/** Icon grid. Three columns on phones, auto-fill from 128px up. */
export function DocumentsGrid({ items, env }: { items: DocItem[]; env: ItemEnv }) {
  return (
    <div className="grid grid-cols-3 gap-1 p-2 md:grid-cols-[repeat(auto-fill,minmax(132px,1fr))] md:gap-1.5 md:p-3">
      {items.map(item => <ItemTile key={item.path} item={item} env={env} />)}
    </div>
  )
}

// Name | Kind | Modified | Size | ⋯ ; phones: Name (+ a secondary line) | ⋯
export const ROW_GRID = 'grid grid-cols-[32px_minmax(0,1fr)_36px] md:grid-cols-[32px_minmax(0,1fr)_150px_170px_86px_36px] items-center gap-x-2 md:gap-x-3'

/** One list row; same click, drag and menu behaviour as a tile. */
export function ItemRow({ item, env }: { item: DocItem; env: ItemEnv }) {
  const { b } = env
  const selected = b.isSelected(item.path)
  const editing = b.renaming === item.path
  const isOver = env.over === item.path
  const pointer = useItemPointer(item, env)
  const kind = item.isDir ? 'Folder' : kindLabel(item)
  const secondary = [
    b.searching ? pathLabel(item.parent) : null,
    item.isDir ? `${item.childCount} item${item.childCount === 1 ? '' : 's'}` : formatBytes(item.size),
    formatModified(item.modified),
  ].filter(Boolean).join(' · ')
  return (
    <div
      {...itemProps(item, env, editing)}
      {...pointer}
      className={`group ${ROW_GRID} min-h-[52px] select-none border-b border-white/[0.05] px-2 py-1.5 outline-none transition-colors last:border-b-0 [-webkit-touch-callout:none] md:min-h-11 md:px-3 ${
        isOver ? 'bg-[var(--accent)]/15 ring-2 ring-inset ring-[var(--accent)]' : selected ? 'bg-[var(--accent)]/[0.13]' : 'hover:bg-white/[0.04]'
      } ${b.lead === item.path ? 'focus-lead group-focus-visible/list:ring-2 group-focus-visible/list:ring-white/45' : ''} ${env.dragging?.has(item.path) ? 'opacity-40' : ''}`}
    >
      <SelectCircle item={item} env={env} selected={selected} className="-ml-1" />
      <div className="flex min-w-0 items-center gap-2.5">
        <ItemIcon item={item} size="row" />
        <div className="flex min-w-0 flex-1 flex-col">
          <ItemName
            item={item}
            editing={editing}
            onCommit={name => env.onCommitRename(item, name)}
            onCancel={b.cancelRename}
            inputClassName="h-7 text-[13.5px]"
            className="max-w-full self-start truncate text-[13.5px] font-medium text-ink"
          />
          <span className="truncate text-[11.5px] text-white/45 md:hidden">{secondary}</span>
          {b.searching && <span className="hidden truncate text-[11.5px] text-white/45 md:block">{pathLabel(item.parent)}</span>}
        </div>
      </div>
      <span className="hidden truncate text-[12.5px] text-white/55 md:block">{kind}</span>
      <span className="hidden truncate text-[12.5px] tabular-nums text-white/55 md:block">{formatModified(item.modified)}</span>
      <span className="hidden text-right text-[12.5px] tabular-nums text-white/55 md:block">{item.isDir ? '—' : formatBytes(item.size)}</span>
      <div className="flex justify-end">
        {!editing && <MoreButton item={item} env={env} className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-[.focus-lead]:opacity-100 [@media(hover:hover)]:group-aria-selected:opacity-100" />}
      </div>
    </div>
  )
}

const COLUMNS: { field: SortField; label: string; className: string }[] = [
  { field: 'name', label: 'Name', className: 'col-start-2' },
  { field: 'kind', label: 'Kind', className: 'hidden md:flex' },
  { field: 'modified', label: 'Modified', className: 'hidden md:flex' },
  { field: 'size', label: 'Size', className: 'hidden md:flex md:justify-end' },
]

/** Sortable column header: click sorts, clicking again reverses. Hidden on phones (the sort menu covers it). */
export function ListHeader({ sort, onSort }: { sort: Sort; onSort: (f: SortField) => void }) {
  return (
    <div className={`${ROW_GRID} sticky top-0 z-[1] hidden h-9 border-b border-white/[0.07] bg-[#120f17]/95 px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-white/45 backdrop-blur md:grid`}>
      {COLUMNS.map(col => {
        const active = sort.field === col.field
        return (
          <button
            key={col.field}
            type="button"
            onClick={() => onSort(col.field)}
            aria-label={`Sort by ${col.label}${active ? `, ${sort.dir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
            className={`${col.className} flex h-full items-center gap-1.5 uppercase tracking-[0.1em] outline-none transition hover:text-white focus-visible:text-white ${active ? 'text-white/85' : ''}`}
          >
            {col.label}
            {active && (sort.dir === 'asc' ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />)}
          </button>
        )
      })}
      <span aria-hidden />
    </div>
  )
}

/** List view rows (the header renders above the listbox). */
export function DocumentsList({ items, env }: { items: DocItem[]; env: ItemEnv }) {
  return (
    <div className="flex flex-col">
      {items.map(item => <ItemRow key={item.path} item={item} env={env} />)}
    </div>
  )
}
