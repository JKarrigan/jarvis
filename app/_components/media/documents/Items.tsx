'use client'

import { formatBytes, formatModified, pathLabel, type DocItem } from './api'
import { DROP_ATTR } from './dnd'
import { fileKind, kindLabel } from './fileKinds'
import { ItemIcon } from './ItemIcon'
import { ItemName, type RenameResult } from './ItemName'
import type { DocumentsBrowserModel } from './useDocumentsBrowser'
import type { Sort, SortField } from './selection'
import { CheckboxIcon, CloseIcon, MoreIcon } from '../photos/icons'
import { AlertIcon, ArrowDownIcon, ArrowUpIcon, FileGlyph, RetryIcon } from './icons'
import type { ListEntry, PlaceholderSource } from './uploadPlan'
import { GRID, ROW_GRID, ROW_HEIGHT, TILE, TILE_META, TILE_NAME, TILE_WELL } from './geometry'

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
  /** Placeholders' own controls (a failed upload's Retry, an in-flight one's cancel). */
  onRetryUpload: (id: string) => void
  onCancelUpload: (id: string) => void
}

/**
 * A plain click or tap opens (folder → in, file → viewer); it never selects. Selecting is
 * explicit: in selection mode a click toggles; ⌘/Ctrl-click toggles and Shift-click
 * ranges from anywhere (desktop power shortcuts, entering selection mode). Outside
 * selection mode the second click of a double-click is ignored, so a Finder habit can't
 * open the folder that slides under the pointer.
 */
function useItemPointer(item: DocItem, env: ItemEnv) {
  const { b } = env
  return {
    // A folder about to be opened is fetched now: hover (mouse) or the press itself
    // (touch, pen, or a click's pointerdown ~100 ms before its click).
    onPointerEnter: item.isDir ? (e: React.PointerEvent) => { if (e.pointerType === 'mouse') b.prefetch(item.path) } : undefined,
    onPointerDown: item.isDir ? () => b.prefetch(item.path) : undefined,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation()
      const mods = { meta: e.metaKey || e.ctrlKey, shift: e.shiftKey }
      if (b.selectMode || mods.meta || mods.shift) {
        if (mods.shift) e.preventDefault()
        b.clickSelect(item.path, mods)
        return
      }
      if (e.detail > 1) return
      b.setLead(item.path)
      b.open(item)
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      b.setLead(item.path)
      env.onMenu(item, { x: e.clientX, y: e.clientY })
    },
  }
}

/** Selection-mode circle (shown on every item while selecting; the click itself toggles). */
function SelectCircle({ selected, className }: { selected: boolean; className: string }) {
  return (
    <span aria-hidden="true" className={`pointer-events-none grid h-8 w-8 place-items-center rounded-full ${selected ? 'text-accent' : 'text-white/80'} ${className}`}>
      <CheckboxIcon checked={selected} className="h-[22px] w-[22px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />
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
        env.b.setLead(item.path)
        env.onMenu(item, e.currentTarget)
      }}
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
    'aria-selected': b.selectMode ? b.isSelected(item.path) : false,
    'data-doc-key': item.path,
    ...(item.isDir ? { [DROP_ATTR]: item.path } : {}),
    draggable,
    onDragStart: draggable ? (e: React.DragEvent) => env.onDragStart(e, item) : undefined,
    onDragEnd: draggable ? env.onDragEnd : undefined,
  }
}

/** One grid tile: icon well, Finder-style name (selected = accent pill), select circle in selection mode, hover ⋯. */
export function ItemTile({ item, env }: { item: DocItem; env: ItemEnv }) {
  const { b } = env
  const selected = b.selectMode && b.isSelected(item.path)
  const editing = b.renaming === item.path
  const isOver = env.over === item.path
  const pointer = useItemPointer(item, env)
  return (
    <div
      {...itemProps(item, env, editing)}
      {...pointer}
      className={`group ${TILE} cursor-pointer select-none outline-none transition-colors [-webkit-touch-callout:none] ${
        isOver ? 'bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]' : selected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.045]'
      } ${b.lead === item.path ? 'focus-lead group-focus-visible/list:ring-2 group-focus-visible/list:ring-white/45' : ''} ${env.dragging?.has(item.path) ? 'opacity-40' : ''}`}
    >
      <div className={TILE_WELL}>
        <ItemIcon item={item} />
      </div>
      <div className={editing ? 'flex min-h-[34.5px] w-full min-w-0 justify-center' : TILE_NAME}>
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
      {b.searching
        ? <span className={`${TILE_META} text-white/45`} title={pathLabel(item.parent)}><span className="truncate">{pathLabel(item.parent)}</span></span>
        : <span className={`${TILE_META} tabular-nums text-white/40`}>{item.isDir ? (item.childCount === 0 ? 'Empty' : `${item.childCount} item${item.childCount === 1 ? '' : 's'}`) : formatBytes(item.size)}</span>}
      {b.selectMode && <SelectCircle selected={selected} className="absolute left-1 top-1" />}
      {!editing && <MoreButton item={item} env={env} className="absolute right-1 top-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-[.focus-lead]:opacity-100 [@media(hover:hover)]:group-aria-selected:opacity-100" />}
    </div>
  )
}

/** Icon grid. Three columns on phones, auto-fill from 128px up. Uploads in flight sit in place as placeholders. */
export function DocumentsGrid({ items, env }: { items: ListEntry[]; env: ItemEnv }) {
  return (
    <div className={GRID}>
      {items.map(item => (item.upload
        ? <UploadTile key={item.path} item={item} upload={item.upload} env={env} />
        : <ItemTile key={item.path} item={item} env={env} />))}
    </div>
  )
}

function uploadStatus(u: PlaceholderSource): { pct: number; label: string } {
  const pct = u.total ? Math.round((u.loaded / u.total) * 100) : 0
  if (u.state === 'error') return { pct, label: 'Failed' }
  if (u.state === 'queued') return { pct: 0, label: 'Queued' }
  return { pct, label: `${pct}%` }
}

/** Progress bar or state line under a placeholder (queued / % / failed + Retry). */
function UploadProgress({ upload, env, compact }: { upload: PlaceholderSource; env: ItemEnv; compact?: boolean }) {
  const { pct, label } = uploadStatus(upload)
  if (upload.state === 'error') {
    return (
      <span className="flex h-5 items-center gap-1.5 text-[11px] font-semibold text-[#ff8a8a]">
        <AlertIcon className="h-3.5 w-3.5 shrink-0" /> {label}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); env.onRetryUpload(upload.id) }}
          aria-label={`Retry ${upload.name}`}
          className="inline-flex h-5 items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2 text-[11px] font-bold text-ink hover:bg-white/[0.12]"
        >
          <RetryIcon className="h-3 w-3" /> Retry
        </button>
      </span>
    )
  }
  return (
    <span className={`flex h-4 items-center gap-2 ${compact ? 'w-full max-w-[200px]' : 'w-[84%]'}`}>
      <span
        role="progressbar"
        aria-label={`Uploading ${upload.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={upload.state === 'queued' ? undefined : pct}
        aria-valuetext={label}
        className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.12]"
      >
        <span className="block h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${upload.state === 'queued' ? 0 : pct}%`, background: 'var(--accent)' }} />
      </span>
      <span className="w-[42px] shrink-0 text-right text-[10.5px] tabular-nums text-white/50">{label}</span>
    </span>
  )
}

/** An upload in flight, drawn where the file will appear (same key, so the stored file takes its spot). */
function UploadTile({ item, upload, env }: { item: DocItem; upload: PlaceholderSource; env: ItemEnv }) {
  return (
    <div
      role="option"
      aria-selected={false}
      aria-disabled="true"
      aria-label={`${item.name}, uploading`}
      data-doc-key={item.path}
      data-upload={upload.state}
      onClick={e => e.stopPropagation()}
      className={`group ${TILE} select-none`}
    >
      <div className={`${TILE_WELL} ${upload.state === 'error' ? '' : 'opacity-60'}`}>
        <FileGlyph kind={fileKind(item)} className="h-[66px] w-[54px]" />
      </div>
      <div className={TILE_NAME}>
        <span title={item.name} className="line-clamp-2 max-w-full px-1.5 py-px text-center text-[12.5px] font-medium leading-[1.3] text-white/60 [overflow-wrap:anywhere]">{item.name}</span>
      </div>
      <span className={`${TILE_META} w-full`}><UploadProgress upload={upload} env={env} /></span>
      {upload.state !== 'error' && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); env.onCancelUpload(upload.id) }}
          aria-label={`Cancel upload of ${item.name}`}
          className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function UploadListRow({ item, upload, env }: { item: DocItem; upload: PlaceholderSource; env: ItemEnv }) {
  return (
    <div
      role="option"
      aria-selected={false}
      aria-disabled="true"
      aria-label={`${item.name}, uploading`}
      data-doc-key={item.path}
      data-upload={upload.state}
      onClick={e => e.stopPropagation()}
      className={`${ROW_GRID} ${ROW_HEIGHT} select-none border-b border-white/[0.05] px-2 last:border-b-0 md:px-3`}
    >
      <span aria-hidden />
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`grid w-8 shrink-0 place-items-center ${upload.state === 'error' ? '' : 'opacity-60'}`}><FileGlyph kind={fileKind(item)} className="h-[28px] w-[23px] shrink-0" /></span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13.5px] font-medium leading-5 text-white/60" title={item.name}>{item.name}</span>
          <UploadProgress upload={upload} env={env} compact />
        </div>
      </div>
      <span className="hidden truncate text-[12.5px] text-white/40 md:block">{kindLabel(item)}</span>
      <span className="hidden truncate text-[12.5px] text-white/40 md:block">{upload.state === 'error' ? 'Not uploaded' : 'Uploading…'}</span>
      <span className="hidden text-right text-[12.5px] tabular-nums text-white/40 md:block">{formatBytes(item.size)}</span>
      <div className="flex justify-end">
        {upload.state !== 'error' && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); env.onCancelUpload(upload.id) }}
            aria-label={`Cancel upload of ${item.name}`}
            className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

/** One list row; same click, drag and menu behaviour as a tile. */
export function ItemRow({ item, env }: { item: DocItem; env: ItemEnv }) {
  const { b } = env
  const selected = b.selectMode && b.isSelected(item.path)
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
      className={`group ${ROW_GRID} ${editing ? 'min-h-[52px] py-1.5 md:min-h-12' : ROW_HEIGHT} cursor-pointer select-none border-b border-white/[0.05] px-2 outline-none transition-colors last:border-b-0 [-webkit-touch-callout:none] md:px-3 ${
        isOver ? 'bg-[var(--accent)]/15 ring-2 ring-inset ring-[var(--accent)]' : selected ? 'bg-[var(--accent)]/[0.13]' : 'hover:bg-white/[0.04]'
      } ${b.lead === item.path ? 'focus-lead group-focus-visible/list:ring-2 group-focus-visible/list:ring-white/45' : ''} ${env.dragging?.has(item.path) ? 'opacity-40' : ''}`}
    >
      {b.selectMode ? <SelectCircle selected={selected} className="-ml-1" /> : <span aria-hidden />}
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
export function DocumentsList({ items, env }: { items: ListEntry[]; env: ItemEnv }) {
  return (
    <div className="flex flex-col">
      {items.map(item => (item.upload
        ? <UploadListRow key={item.path} item={item} upload={item.upload} env={env} />
        : <ItemRow key={item.path} item={item} env={env} />))}
    </div>
  )
}
