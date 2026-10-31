'use client'

import { useState } from 'react'
import { formatSize, formatDate, fileTypeInfo, type ApiEntry, type SearchResult } from '@/lib/fileTypes'
import { DownloadIcon, FileIcon, PencilIcon, TrashIcon, UpArrowIcon } from './icons'

// Row actions are revealed on hover where there is a hover (mouse/trackpad);
// on touch screens they are always visible, since there is nothing to hover.
const HOVER_REVEAL = '[@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-within:opacity-100'

// ─── Drop target ──────────────────────────────────────────────────────────────

/**
 * Drag-and-drop move target. `dragged` is the entry currently being dragged
 * (null when no drag is in progress); the highlight is tied to that drag, so it
 * can't stick around once the drag ends somewhere else.
 */
export function useDropTarget(dragged: ApiEntry | null, canDrop: boolean, onDrop: () => void) {
  const [overFor, setOverFor] = useState<ApiEntry | null>(null)
  const enabled = canDrop && dragged !== null
  const isDragOver = enabled && overFor === dragged
  const dropProps = enabled
    ? {
        onDragEnter: (e: React.DragEvent) => { e.preventDefault(); setOverFor(dragged) },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverFor(null)
        },
        onDragOver: (e: React.DragEvent) => e.preventDefault(),
        onDrop: (e: React.DragEvent) => { e.preventDefault(); setOverFor(null); onDrop() },
      }
    : {}
  return { isDragOver, dropProps }
}

type DragProps = {
  /** The entry being dragged right now, if any. */
  dragged: ApiEntry | null
  onDragStart: () => void
  onDragEnd: () => void
  /** Move the dragged entry into this row (folders only). */
  onDrop: () => void
}

// ─── Parent Row (move up / navigate up) ──────────────────────────────────────

export function ParentRow({
  dragged,
  onNavigate,
  onDrop,
}: {
  dragged: ApiEntry | null
  onNavigate: () => void
  onDrop: () => void
}) {
  const { isDragOver, dropProps } = useDropTarget(dragged, true, onDrop)
  return (
    <div
      {...dropProps}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer select-none ${
        isDragOver
          ? 'ring-1 ring-inset ring-zinc-500 bg-zinc-800/60'
          : 'hover:bg-zinc-900'
      }`}
    >
      <div className="w-5 h-5 shrink-0 flex items-center justify-center">
        <UpArrowIcon className="text-zinc-600" />
      </div>
      <span className="flex-1 text-sm text-zinc-600 min-w-0 truncate">
        .. parent folder
      </span>
    </div>
  )
}

// ─── List Row ─────────────────────────────────────────────────────────────────

// Uses CSS grid to lock column widths regardless of content length.
// Columns: icon(20px) | name(1fr) | type(112px, sm+) | size(80px, md+) | modified(112px, lg+) | actions(80px)
const ROW_GRID = 'grid grid-cols-[20px_minmax(0,1fr)_80px] sm:grid-cols-[20px_minmax(0,1fr)_112px_80px] md:grid-cols-[20px_minmax(0,1fr)_112px_80px_80px] lg:grid-cols-[20px_minmax(0,1fr)_112px_80px_112px_80px]'

export function ListRow({
  entry,
  selected,
  dragged,
  onActivate,
  onSelect,
  onDownload,
  onRename,
  onDelete,
  onDragStart,
  onDragEnd,
  onDrop,
}: DragProps & {
  entry: ApiEntry
  selected: boolean
  onActivate: () => void
  onSelect: () => void
  onDownload: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const isDir = entry.kind === 'dir'
  const info = entry.kind === 'file' ? fileTypeInfo(entry.ext) : null
  const isDragging = dragged?.name === entry.name
  const { isDragOver, dropProps } = useDropTarget(dragged, isDir && !isDragging, onDrop)

  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart() }}
      onDragEnd={onDragEnd}
      {...dropProps}
      onClick={isDir ? onActivate : onSelect}
      className={`group ${ROW_GRID} items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
        isDragOver
          ? 'ring-1 ring-inset ring-zinc-500 bg-zinc-800/60'
          : isDragging
            ? 'opacity-40'
            : selected
              ? 'bg-zinc-800 text-zinc-100'
              : 'hover:bg-zinc-900 text-zinc-300'
      }`}
    >
      <FileIcon entry={entry} className="w-5 h-5" />

      <span className={`text-sm font-medium truncate ${selected && !isDragOver ? 'text-zinc-100' : 'text-zinc-200'}`}>
        {entry.name}
      </span>

      {/* type — hidden below sm, shown at sm+ (col 3) */}
      <span className="hidden sm:block text-xs text-zinc-600 truncate">
        {isDir ? 'Folder' : info?.label}
      </span>

      {/* size — hidden below md, shown at md+ (col 4) */}
      <span className="hidden md:block text-xs font-mono text-zinc-600 text-right truncate">
        {entry.kind === 'file' ? formatSize(entry.size) : '—'}
      </span>

      {/* modified — hidden below lg, shown at lg+ (col 5) */}
      <span className="hidden lg:block text-xs text-zinc-600 text-right truncate">
        {formatDate(entry.modified)}
      </span>

      {/* actions (always last col) */}
      <div className={`flex items-center justify-end gap-0 transition-opacity ${selected ? 'opacity-100' : HOVER_REVEAL}`}>
        {!isDir && (
          <button
            onClick={e => { e.stopPropagation(); onDownload() }}
            title="Download"
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
          >
            <DownloadIcon />
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); onRename() }}
          title="Rename"
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
        >
          <PencilIcon />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Delete"
          className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition-colors"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}

// ─── List Header ──────────────────────────────────────────────────────────────

export function ListHeader() {
  return (
    <div className={`${ROW_GRID} items-center gap-3 px-3 py-2 border-b border-zinc-800/60`}>
      <span />
      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-600">Name</span>
      <span className="hidden sm:block text-xs font-semibold uppercase tracking-widest text-zinc-600">Type</span>
      <span className="hidden md:block text-xs font-semibold uppercase tracking-widest text-zinc-600 text-right">Size</span>
      <span className="hidden lg:block text-xs font-semibold uppercase tracking-widest text-zinc-600 text-right">Modified</span>
      <span />
    </div>
  )
}

// ─── Grid Cell ────────────────────────────────────────────────────────────────

export function GridCell({
  entry,
  selected,
  dragged,
  onActivate,
  onSelect,
  onDownload,
  onRename,
  onDelete,
  onDragStart,
  onDragEnd,
  onDrop,
}: DragProps & {
  entry: ApiEntry
  selected: boolean
  onActivate: () => void
  onSelect: () => void
  onDownload: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const isDir = entry.kind === 'dir'
  const info = entry.kind === 'file' ? fileTypeInfo(entry.ext) : null
  const isDragging = dragged?.name === entry.name
  const { isDragOver, dropProps } = useDropTarget(dragged, isDir && !isDragging, onDrop)

  return (
    <div
      className={`relative group transition-opacity ${isDragging ? 'opacity-40' : ''}`}
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart() }}
      onDragEnd={onDragEnd}
      {...dropProps}
    >
      <button
        onClick={isDir ? onActivate : onSelect}
        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors text-left w-full ${
          isDragOver
            ? 'border-zinc-400 bg-zinc-800'
            : selected
              ? 'border-zinc-500 bg-zinc-800'
              : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900'
        }`}
      >
        <FileIcon entry={entry} className="w-9 h-9" />
        <div className="w-full space-y-0.5">
          <p className="text-xs font-medium text-zinc-100 truncate text-center">{entry.name}</p>
          <p className="text-xs text-zinc-600 text-center">
            {entry.kind === 'file' ? `${info?.label} · ${formatSize(entry.size)}` : 'Folder'}
          </p>
        </div>
      </button>
      <div className={`absolute top-2 right-2 flex items-center gap-0.5 transition-all ${selected ? 'opacity-100' : HOVER_REVEAL}`}>
        {!isDir && (
          <button
            onClick={e => { e.stopPropagation(); onDownload() }}
            title="Download"
            className="p-1 rounded-md text-zinc-600 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            <DownloadIcon size={12} />
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); onRename() }}
          title="Rename"
          className="p-1 rounded-md text-zinc-600 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
        >
          <PencilIcon size={12} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Delete"
          className="p-1 rounded-md text-zinc-600 hover:text-red-400 hover:bg-zinc-700 transition-colors"
        >
          <TrashIcon size={12} />
        </button>
      </div>
    </div>
  )
}

// ─── Parent Grid Cell ─────────────────────────────────────────────────────────

export function ParentGridCell({
  dragged,
  onNavigate,
  onDrop,
}: {
  dragged: ApiEntry | null
  onNavigate: () => void
  onDrop: () => void
}) {
  const { isDragOver, dropProps } = useDropTarget(dragged, true, onDrop)
  return (
    <div
      {...dropProps}
      onClick={onNavigate}
      className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors cursor-pointer ${
        isDragOver
          ? 'border-zinc-400 bg-zinc-800'
          : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900'
      }`}
    >
      <div className="w-9 h-9 flex items-center justify-center">
        <UpArrowIcon className="text-zinc-600 w-7 h-7" />
      </div>
      <div className="w-full space-y-0.5">
        <p className="text-xs font-medium text-zinc-500 truncate text-center">..</p>
        <p className="text-xs text-zinc-700 text-center">Parent</p>
      </div>
    </div>
  )
}

// ─── Search Result Row ────────────────────────────────────────────────────────

export function SearchResultRow({
  result,
  onOpen,
  onDownload,
}: {
  result: SearchResult
  onOpen: () => void
  onDownload: () => void
}) {
  const isDir = result.kind === 'dir'
  const info = result.kind === 'file' ? fileTypeInfo(result.ext) : null
  const parentPath = result.relPath.split('/').slice(0, -1).join('/')

  return (
    <div
      onClick={onOpen}
      className="group grid grid-cols-[20px_minmax(0,1fr)_64px] sm:grid-cols-[20px_minmax(0,1fr)_80px_64px] items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer hover:bg-zinc-900"
    >
      <FileIcon entry={result} className="w-5 h-5" />

      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-200 truncate">{result.name}</p>
        {parentPath && (
          <p className="text-xs text-zinc-600 truncate">{parentPath}</p>
        )}
      </div>

      <span className="hidden sm:block text-xs text-zinc-600 truncate">
        {isDir ? 'Folder' : info?.label}
      </span>

      <div className={`flex items-center justify-end gap-0.5 transition-opacity ${HOVER_REVEAL}`}>
        {!isDir && (
          <button
            onClick={e => { e.stopPropagation(); onDownload() }}
            title="Download"
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
          >
            <DownloadIcon />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-700">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 2h9a2 2 0 012 2z" />
      </svg>
      <p className="text-sm text-zinc-600">This folder is empty</p>
    </div>
  )
}
