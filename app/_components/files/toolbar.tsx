'use client'

import { useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { SortKey } from '@/lib/fileTypes'
import { ChevronRight, GridViewIcon, ListViewIcon, SearchIcon, XIcon } from './icons'
import type { DiskInfo } from './useDirectory'

export type ViewMode = 'list' | 'grid'
export type FilterKind = 'dir' | 'image' | 'video' | 'doc' | 'sheet' | 'archive' | 'text' | 'generic'

export const FILTER_LABELS: Record<FilterKind, string> = {
  dir: 'Folders', image: 'Images', video: 'Videos', doc: 'Documents',
  sheet: 'Sheets', archive: 'Archives', text: 'Text', generic: 'Other',
}
const FILTER_ORDER: FilterKind[] = ['dir', 'image', 'video', 'doc', 'sheet', 'archive', 'text', 'generic']

const SORT_LABELS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size' },
  { key: 'modified', label: 'Date' },
]

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

export function Breadcrumb({ path, onNavigate }: { path: string[]; onNavigate: (idx: number) => void }) {
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

export function StorageBar({ disk }: { disk: DiskInfo | null }) {
  if (!disk || disk.totalBytes === 0) {
    return (
      <div className="space-y-1.5">
        <div className="h-1 w-full rounded-full bg-zinc-800 animate-pulse" />
        <p className="text-xs text-zinc-700">Loading storage info…</p>
      </div>
    )
  }

  const pct = (disk.usedBytes / disk.totalBytes) * 100
  const usedGB = disk.usedBytes / (1024 ** 3)
  const totalGB = disk.totalBytes / (1024 ** 3)
  const totalLabel = totalGB >= 1024
    ? `${(totalGB / 1024).toFixed(1)} TB`
    : `${totalGB.toFixed(0)} GB`

  return (
    <div className="space-y-1.5">
      <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500/70 transition-all"
          style={{ width: `${Math.max(pct, 0.15)}%` }}
        />
      </div>
      <p className="text-xs text-zinc-600">
        {usedGB.toFixed(1)} GB used of {totalLabel}
      </p>
    </div>
  )
}

// ─── Search bar ───────────────────────────────────────────────────────────────

export function SearchBar({ query, onChange }: { query: string; onChange: (q: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-600">
        <SearchIcon size={14} />
      </div>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search files…"
        value={query}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { onChange(''); inputRef.current?.blur() } }}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-8 py-2 text-sm text-zinc-200 placeholder-zinc-700 outline-none focus:border-zinc-600 transition-colors"
      />
      <AnimatePresence>
        {query && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.12 }}
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="absolute inset-y-0 right-2.5 flex items-center text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <XIcon size={14} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Sort / view bar ──────────────────────────────────────────────────────────

export function SortViewBar({
  sortKey,
  onSort,
  viewMode,
  onView,
  count,
}: {
  sortKey: SortKey
  onSort: (k: SortKey) => void
  viewMode: ViewMode
  onView: (m: ViewMode) => void
  count: number
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-0.5">
        <span className="text-xs text-zinc-600 mr-2">Sort</span>
        {SORT_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onSort(key)}
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
        <span className="text-xs text-zinc-700 mr-2">{count} item{count !== 1 ? 's' : ''}</span>
        <button
          onClick={() => onView('list')}
          className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'text-zinc-100 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}
          title="List view"
        >
          <ListViewIcon />
        </button>
        <button
          onClick={() => onView('grid')}
          className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'text-zinc-100 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}
          title="Grid view"
        >
          <GridViewIcon />
        </button>
      </div>
    </div>
  )
}

// ─── Type filter chips ────────────────────────────────────────────────────────

export function FilterBar({
  available,
  value,
  onChange,
}: {
  available: Set<FilterKind>
  value: FilterKind | null
  onChange: (f: FilterKind | null) => void
}) {
  return (
    <AnimatePresence>
      {available.size > 1 && (
        <motion.div
          key="filter-bar"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <button
              onClick={() => onChange(null)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                value === null
                  ? 'bg-zinc-700 border-zinc-600 text-zinc-100'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              All
            </button>
            {FILTER_ORDER.filter(k => available.has(k)).map(kind => (
              <button
                key={kind}
                onClick={() => onChange(value === kind ? null : kind)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  value === kind
                    ? 'bg-zinc-700 border-zinc-600 text-zinc-100'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {FILTER_LABELS[kind]}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
