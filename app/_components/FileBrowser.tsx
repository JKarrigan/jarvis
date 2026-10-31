'use client'

import { useCallback, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  sortEntries, fileTypeInfo,
  type ApiEntry, type ApiFileEntry, type SortKey, type SearchResult,
} from '@/lib/fileTypes'
import { useToast, Toast } from '@/app/_components/Toast'
import { NewFolderIcon, SearchIcon, UploadIcon } from './files/icons'
import {
  NewFolderModal, UploadModal, DeleteFileModal, DeleteFolderModal, RenameModal, ConflictModal,
} from './files/modals'
import { PreviewModal } from './files/PreviewModal'
import {
  ParentRow, ListRow, ListHeader, GridCell, ParentGridCell, SearchResultRow, EmptyState,
} from './files/rows'
import {
  Breadcrumb, StorageBar, SearchBar, SortViewBar, FilterBar, FILTER_LABELS,
  type FilterKind, type ViewMode,
} from './files/toolbar'
import { joinPath, triggerDownload } from './files/api'
import { useDirectory } from './files/useDirectory'
import { useFileSearch } from './files/useFileSearch'
import { useFileOps } from './files/useFileOps'

const PREVIEWABLE = ['image', 'video', 'text']

function kindOf(e: ApiEntry): FilterKind {
  return e.kind === 'dir' ? 'dir' : fileTypeInfo(e.ext).iconKind
}

function Spinner() {
  return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-zinc-400 animate-spin" />
    </div>
  )
}

export function FileBrowser() {
  const [currentPath, setCurrentPath] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [selected, setSelected] = useState<string | null>(null)
  const [previewEntry, setPreviewEntry] = useState<{ entry: ApiFileEntry; filePath: string; siblings: ApiFileEntry[] } | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [uploadDir, setUploadDir] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<ApiEntry | null>(null)
  const [dragEntry, setDragEntry] = useState<ApiEntry | null>(null)
  const [filterType, setFilterType] = useState<FilterKind | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const { toast, showToast, dismissToast } = useToast()

  const dir = joinPath(currentPath)
  const { entries, disk, loading, error, reload } = useDirectory(dir)
  const { isSearching, searchLoading, results: searchResults, truncated: searchTruncated } = useFileSearch(searchQuery)
  const ops = useFileOps({ dir, showToast, onChanged: reload })
  const closeUpload = useCallback(() => setUploadDir(null), [])

  const sorted = sortEntries(entries, sortKey)
  const availableTypes = new Set<FilterKind>(entries.map(kindOf))
  const matchesFilter = (e: ApiEntry) => !filterType || kindOf(e) === filterType
  const filtered = sorted.filter(matchesFilter)
  const filteredSearchResults = searchResults.filter(matchesFilter)

  function goTo(path: string[]) {
    setCurrentPath(path)
    setSelected(null)
    setFilterType(null)
  }
  const navigateInto = (name: string) => goTo([...currentPath, name])
  const navigateTo = (idx: number) => goTo(idx < 0 ? [] : currentPath.slice(0, idx + 1))
  const navigateUp = () => goTo(currentPath.slice(0, -1))

  function handleSelect(entry: ApiFileEntry) {
    if (PREVIEWABLE.includes(fileTypeInfo(entry.ext).iconKind)) {
      const siblings = sorted.filter(
        (e): e is ApiFileEntry => e.kind === 'file' && PREVIEWABLE.includes(fileTypeInfo(e.ext).iconKind),
      )
      setPreviewEntry({ entry, filePath: joinPath(dir, entry.name), siblings })
    } else {
      setSelected(s => s === entry.name ? null : entry.name)
    }
  }

  function handleSearchResultOpen(result: SearchResult) {
    if (result.kind === 'dir') {
      goTo(result.relPath.split('/').filter(Boolean))
      setSearchQuery('')
    } else if (PREVIEWABLE.includes(fileTypeInfo(result.ext).iconKind)) {
      setPreviewEntry({ entry: result, filePath: result.relPath, siblings: [] })
    } else {
      triggerDownload(result.relPath, result.name)
    }
  }

  function dropInto(target: ApiEntry) {
    const dragged = dragEntry
    setDragEntry(null)
    if (!dragged || target.kind !== 'dir' || dragged.name === target.name) return
    void ops.move(dragged, joinPath(dir, target.name), `into "${target.name}"`, `“${target.name}”`)
  }

  function dropOnParent() {
    const dragged = dragEntry
    setDragEntry(null)
    if (!dragged || currentPath.length === 0) return
    void ops.move(dragged, joinPath(currentPath.slice(0, -1)), 'to parent folder', 'the parent folder')
  }

  function rowProps(entry: ApiEntry) {
    return {
      entry,
      selected: selected === entry.name,
      dragged: dragEntry,
      onActivate: () => entry.kind === 'dir' && navigateInto(entry.name),
      onSelect: () => entry.kind === 'file' && handleSelect(entry),
      onDownload: () => entry.kind === 'file' && triggerDownload(joinPath(dir, entry.name), entry.name),
      onRename: () => setRenameTarget(entry),
      onDelete: () => ops.requestDelete(entry),
      onDragStart: () => setDragEntry(entry),
      onDragEnd: () => setDragEntry(null),
      onDrop: () => dropInto(entry),
    }
  }

  const toolbarButton = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-colors'

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <main className="p-6 space-y-5 max-w-5xl mx-auto w-full">

        {/* ── Toolbar ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <Breadcrumb path={currentPath} onNavigate={navigateTo} />
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setUploadDir(dir)} className={toolbarButton}>
                <UploadIcon />
                Upload
              </button>
              <button onClick={() => setNewFolderOpen(true)} className={toolbarButton}>
                <NewFolderIcon />
                New Folder
              </button>
            </div>
          </div>

          <SearchBar query={searchQuery} onChange={setSearchQuery} />

          {!isSearching && (
            <SortViewBar
              sortKey={sortKey}
              onSort={setSortKey}
              viewMode={viewMode}
              onView={setViewMode}
              count={filtered.length}
            />
          )}

          <FilterBar available={availableTypes} value={filterType} onChange={setFilterType} />
        </div>

        {/* ── Storage Bar ── */}
        {!isSearching && <StorageBar disk={disk} />}

        {isSearching ? (
          /* ── Search Results ── */
          searchLoading ? (
            <Spinner />
          ) : filteredSearchResults.length === 0 ? (
            <div className="flex flex-col items-center py-20 gap-2">
              <SearchIcon size={36} className="text-zinc-700" />
              <p className="text-sm text-zinc-600">
                {searchResults.length > 0 && filterType
                  ? `No ${FILTER_LABELS[filterType].toLowerCase()} matching “${searchQuery.trim()}”`
                  : `No results for “${searchQuery.trim()}”`}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <div className="px-3 py-2 border-b border-zinc-800/60">
                <span className="text-xs text-zinc-600">
                  {filteredSearchResults.length}{searchTruncated ? '+' : ''} result{filteredSearchResults.length !== 1 ? 's' : ''}
                  {searchTruncated && ' — more results, refine your search'}
                </span>
              </div>
              <div className="divide-y divide-zinc-800/40">
                {filteredSearchResults.map((result, i) => (
                  <SearchResultRow
                    key={`${result.relPath}-${i}`}
                    result={result}
                    onOpen={() => handleSearchResultOpen(result)}
                    onDownload={() => triggerDownload(result.relPath, result.name)}
                  />
                ))}
              </div>
            </div>
          )
        ) : (
          /* ── File Listing ── */
          loading ? (
            <Spinner />
          ) : error ? (
            <div className="flex flex-col items-center py-20 gap-2">
              <p className="text-sm text-red-400">Failed to load files</p>
              <p className="text-xs text-zinc-600">{error}</p>
            </div>
          ) : sorted.length === 0 && currentPath.length === 0 ? (
            <EmptyState />
          ) : viewMode === 'list' ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <ListHeader />
              <div className="divide-y divide-zinc-800/40">
                {currentPath.length > 0 && (
                  <ParentRow dragged={dragEntry} onNavigate={navigateUp} onDrop={dropOnParent} />
                )}
                {filtered.map(entry => <ListRow key={entry.name} {...rowProps(entry)} />)}
                {filtered.length === 0 && (
                  <div className="px-3 py-10 text-center">
                    <p className="text-sm text-zinc-600">
                      {filterType ? `No ${FILTER_LABELS[filterType].toLowerCase()} in this folder` : 'This folder is empty'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {currentPath.length > 0 && (
                <ParentGridCell dragged={dragEntry} onNavigate={navigateUp} onDrop={dropOnParent} />
              )}
              {filtered.map(entry => <GridCell key={entry.name} {...rowProps(entry)} />)}
            </div>
          )
        )}
      </main>

      <AnimatePresence>
        {newFolderOpen && (
          <NewFolderModal
            key="new-folder"
            onConfirm={name => { setNewFolderOpen(false); void ops.mkdir(name) }}
            onClose={() => setNewFolderOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {uploadDir !== null && (
          <UploadModal
            key="upload"
            dir={uploadDir}
            onChanged={reload}
            onClose={closeUpload}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ops.deleteFileTarget && (
          <DeleteFileModal
            key="delete-file"
            file={ops.deleteFileTarget}
            onConfirm={() => {
              const target = ops.deleteFileTarget!
              ops.setDeleteFileTarget(null)
              void ops.remove(target, { recursive: true }).then(ok => { if (ok) setSelected(null) })
            }}
            onClose={() => ops.setDeleteFileTarget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ops.deleteFolderTarget && (
          <DeleteFolderModal
            key="delete-folder"
            folder={ops.deleteFolderTarget}
            onConfirm={() => {
              const target = ops.deleteFolderTarget!
              ops.setDeleteFolderTarget(null)
              void ops.remove(target, { recursive: true }).then(ok => { if (ok) setSelected(null) })
            }}
            onClose={() => ops.setDeleteFolderTarget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {renameTarget && (
          <RenameModal
            key="rename"
            entry={renameTarget}
            onConfirm={newName => { setRenameTarget(null); void ops.rename(renameTarget, newName) }}
            onClose={() => setRenameTarget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ops.conflict && (
          <ConflictModal key="conflict" conflict={ops.conflict} onClose={() => ops.setConflict(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewEntry && (
          <PreviewModal
            key="preview"
            initialEntry={previewEntry.entry}
            initialFilePath={previewEntry.filePath}
            siblings={previewEntry.siblings}
            onClose={() => setPreviewEntry(null)}
          />
        )}
      </AnimatePresence>

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
