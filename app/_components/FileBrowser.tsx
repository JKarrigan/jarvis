'use client'

import { useState } from 'react'
import {
  getEntries, sortEntries, formatSize, formatDate, fileTypeInfo,
  MOCK_USED_GB, MOCK_TOTAL_TB,
  type Entry, type FileEntry, type SortKey,
} from '@/lib/mockFiles'
import { useToast, Toast } from '@/app/_components/Toast'

// ─── Icons ────────────────────────────────────────────────────────────────────

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20 6h-8l-2-2H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
    </svg>
  )
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  )
}

function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  )
}

function SheetIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  )
}

function TextIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

function FileIcon({ entry, className }: { entry: Entry; className?: string }) {
  if (entry.kind === 'dir') return <FolderIcon className={`text-amber-400 ${className ?? ''}`} />
  const { iconKind, color } = fileTypeInfo(entry.ext)
  const cls = `${color} ${className ?? ''}`
  if (iconKind === 'image') return <ImageIcon className={cls} />
  if (iconKind === 'video') return <VideoIcon className={cls} />
  if (iconKind === 'archive') return <ArchiveIcon className={cls} />
  if (iconKind === 'sheet') return <SheetIcon className={cls} />
  if (iconKind === 'text') return <TextIcon className={cls} />
  return <DocIcon className={cls} />
}

// ─── Toolbar Icons ─────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function NewFolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 2h9a2 2 0 012 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  )
}

function ListViewIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="3" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function GridViewIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({ path, onNavigate }: { path: string[]; onNavigate: (idx: number) => void }) {
  return (
    <nav className="flex items-center gap-1 text-sm flex-wrap">
      <button
        onClick={() => onNavigate(-1)}
        className={`transition-colors ${path.length === 0 ? 'text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
      >
        Home
      </button>
      {path.map((segment, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="text-zinc-700"><ChevronRight /></span>
          <button
            onClick={() => onNavigate(i)}
            className={`transition-colors ${i === path.length - 1 ? 'text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {segment}
          </button>
        </span>
      ))}
    </nav>
  )
}

// ─── Storage Bar ──────────────────────────────────────────────────────────────

function StorageBar() {
  const totalGB = MOCK_TOTAL_TB * 1024
  const pct = (MOCK_USED_GB / totalGB) * 100

  return (
    <div className="space-y-1.5">
      <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500/70 transition-all"
          style={{ width: `${Math.max(pct, 0.15)}%` }}
        />
      </div>
      <p className="text-xs text-zinc-600">
        {MOCK_USED_GB} GB used of {MOCK_TOTAL_TB} TB
      </p>
    </div>
  )
}

// ─── List Row ─────────────────────────────────────────────────────────────────

function ListRow({
  entry,
  selected,
  onActivate,
  onSelect,
  onAction,
}: {
  entry: Entry
  selected: boolean
  onActivate: () => void
  onSelect: () => void
  onAction: (action: 'download' | 'delete') => void
}) {
  const isDir = entry.kind === 'dir'
  const info = isDir ? null : fileTypeInfo((entry as FileEntry).ext)

  return (
    <div
      onClick={isDir ? onActivate : onSelect}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
        selected
          ? 'bg-zinc-800 text-zinc-100'
          : 'hover:bg-zinc-900 text-zinc-300'
      }`}
    >
      <FileIcon entry={entry} className="w-5 h-5 shrink-0" />

      <span className={`flex-1 text-sm font-medium truncate min-w-0 ${selected ? 'text-zinc-100' : 'text-zinc-200'}`}>
        {entry.name}
      </span>

      {/* type */}
      <span className="hidden sm:block w-28 shrink-0 text-xs text-zinc-600 truncate">
        {isDir ? 'Folder' : info?.label}
      </span>

      {/* size */}
      <span className="hidden md:block w-20 shrink-0 text-xs font-mono text-zinc-600 text-right">
        {isDir ? '—' : formatSize((entry as FileEntry).size)}
      </span>

      {/* date */}
      <span className="hidden lg:block w-28 shrink-0 text-xs text-zinc-600 text-right">
        {formatDate(entry.modified)}
      </span>

      {/* actions */}
      {!isDir && (
        <div className={`flex items-center gap-0.5 shrink-0 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <button
            onClick={e => { e.stopPropagation(); onAction('download') }}
            title="Download"
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
          >
            <DownloadIcon />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onAction('delete') }}
            title="Delete"
            className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition-colors"
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Grid Cell ────────────────────────────────────────────────────────────────

function GridCell({
  entry,
  selected,
  onActivate,
  onSelect,
}: {
  entry: Entry
  selected: boolean
  onActivate: () => void
  onSelect: () => void
}) {
  const isDir = entry.kind === 'dir'
  const info = isDir ? null : fileTypeInfo((entry as FileEntry).ext)

  return (
    <button
      onClick={isDir ? onActivate : onSelect}
      className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors text-left w-full ${
        selected
          ? 'border-zinc-500 bg-zinc-800'
          : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900'
      }`}
    >
      <FileIcon entry={entry} className="w-9 h-9" />
      <div className="w-full space-y-0.5">
        <p className="text-xs font-medium text-zinc-100 truncate text-center">{entry.name}</p>
        <p className="text-xs text-zinc-600 text-center">
          {isDir ? 'Folder' : `${info?.label} · ${formatSize((entry as FileEntry).size)}`}
        </p>
      </div>
    </button>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-700">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 2h9a2 2 0 012 2z" />
      </svg>
      <p className="text-sm text-zinc-600">This folder is empty</p>
    </div>
  )
}

// ─── FileBrowser ──────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'grid'

export function FileBrowser() {
  const [currentPath, setCurrentPath] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [selected, setSelected] = useState<string | null>(null)
  const { toast, showToast } = useToast()

  const entries = getEntries(currentPath)
  const sorted = sortEntries(entries, sortKey)

  function navigateInto(name: string) {
    setCurrentPath(p => [...p, name])
    setSelected(null)
  }

  function navigateTo(idx: number) {
    setCurrentPath(p => idx < 0 ? [] : p.slice(0, idx + 1))
    setSelected(null)
  }

  function handleSelect(name: string) {
    setSelected(s => s === name ? null : name)
  }

  function handleAction(action: 'download' | 'delete') {
    if (action === 'download') showToast('success', 'Downloads will work once storage is connected.')
    if (action === 'delete') showToast('error', 'Deletion will work once storage is connected.')
  }

  function handleUpload() {
    showToast('success', 'Upload will work once storage is connected.')
  }

  function handleNewFolder() {
    showToast('success', 'New folder will work once storage is connected.')
  }

  const sortLabels: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'size', label: 'Size' },
    { key: 'modified', label: 'Date' },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <main className="p-6 space-y-5 max-w-5xl mx-auto w-full">

        {/* ── Toolbar ── */}
        <div className="space-y-3">
          {/* Row 1: breadcrumb + actions */}
          <div className="flex items-center justify-between gap-4">
            <Breadcrumb path={currentPath} onNavigate={navigateTo} />
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleUpload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <UploadIcon />
                Upload
              </button>
              <button
                onClick={handleNewFolder}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <NewFolderIcon />
                New Folder
              </button>
            </div>
          </div>

          {/* Row 2: sort tabs + count + view toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-zinc-600 mr-2">Sort</span>
              {sortLabels.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    sortKey === key
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-700 mr-2">{sorted.length} item{sorted.length !== 1 ? 's' : ''}</span>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'text-zinc-100 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}
                title="List view"
              >
                <ListViewIcon />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'text-zinc-100 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}
                title="Grid view"
              >
                <GridViewIcon />
              </button>
            </div>
          </div>
        </div>

        {/* ── Storage Bar ── */}
        <StorageBar />

        {/* ── File Listing ── */}
        {sorted.length === 0 ? (
          <EmptyState />
        ) : viewMode === 'list' ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            {/* Column headers */}
            <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800/60">
              <span className="w-5 shrink-0" />
              <span className="flex-1 text-xs font-semibold uppercase tracking-widest text-zinc-600">Name</span>
              <span className="hidden sm:block w-28 shrink-0 text-xs font-semibold uppercase tracking-widest text-zinc-600">Type</span>
              <span className="hidden md:block w-20 shrink-0 text-xs font-semibold uppercase tracking-widest text-zinc-600 text-right">Size</span>
              <span className="hidden lg:block w-28 shrink-0 text-xs font-semibold uppercase tracking-widest text-zinc-600 text-right">Modified</span>
              <span className="w-16 shrink-0" />
            </div>
            {/* Rows */}
            <div className="divide-y divide-zinc-800/40">
              {sorted.map(entry => (
                <ListRow
                  key={entry.name}
                  entry={entry}
                  selected={selected === entry.name}
                  onActivate={() => entry.kind === 'dir' && navigateInto(entry.name)}
                  onSelect={() => handleSelect(entry.name)}
                  onAction={handleAction}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {sorted.map(entry => (
              <GridCell
                key={entry.name}
                entry={entry}
                selected={selected === entry.name}
                onActivate={() => entry.kind === 'dir' && navigateInto(entry.name)}
                onSelect={() => handleSelect(entry.name)}
              />
            ))}
          </div>
        )}
      </main>

      <Toast toast={toast} />
    </div>
  )
}
