'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Toast } from '../photos/PhotoBrowser'
import { useMounted, useToast } from '../photos/hooks'
import { CloseIcon, DownloadIcon, OfflineIcon, TrashIcon, UploadIcon } from '../photos/icons'
import {
  DocsApiError, ROOT_NAME, baseName, downloadFile, errorText, formatBytes, joinPath, listFolder, makeFolder, moveItem,
  parentOf, plural, renameItem, runPool, type DocItem,
} from './api'
import { ActionMenu, buildActions, type Action, type ActionHandlers } from './ActionMenu'
import { DeleteDialog } from './DeleteDialog'
import { DocumentViewer } from './DocumentViewer'
import { useCanDrag, useDocumentsDnd } from './dnd'
import { nextUntitledName } from './fileKinds'
import { useStorageStatus } from './hooks'
import { FolderGlyph, FolderPlusIcon, MoveIcon } from './icons'
import { DocumentsGrid, DocumentsList, ListHeader, type ItemEnv } from './Items'
import type { RenameResult } from './ItemName'
import { MoveToDialog } from './MoveToDialog'
import { Breadcrumbs, SearchField, SortMenu, ViewToggle } from './Toolbar'
import { UploadsPanel } from './UploadsPanel'
import { useDocumentsBrowser } from './useDocumentsBrowser'
import { useUploads } from './useUploads'
import { DocumentsGridSkeleton } from './DocumentsSkeleton'

type DialogState = { kind: 'move'; items: DocItem[] } | { kind: 'delete'; items: DocItem[] } | null
type MenuState = { actions: Action[]; at: { x: number; y: number } | HTMLElement; label: string } | null

const glassBtn = 'inline-flex h-10 items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.06] px-3.5 text-[13.5px] font-semibold text-ink transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45'

/**
 * /media/documents — a Finder-style browser over the documents share (port of
 * GuardianPad's client Documents tab, restyled for Reel): grid/list, breadcrumbs,
 * tree-wide search, selection, inline rename, native drag and drop, Move to…, a shared
 * right-click / ⋯ menu, an upload queue, a delete confirm and the file viewer.
 */
export function DocumentsBrowser() {
  const [statusSeq, setStatusSeq] = useState(0)
  const status = useStorageStatus(statusSeq)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [menu, setMenu] = useState<MenuState>(null)
  const [creating, setCreating] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const { toast, show } = useToast()
  const mounted = useMounted()
  const canDrag = useCanDrag()

  const requestDelete = useCallback((items: DocItem[]) => { if (items.length) setDialog({ kind: 'delete', items }) }, [])
  const listRef = useRef<HTMLDivElement>(null)
  const b = useDocumentsBrowser({ containerRef: listRef, storageOffline: status?.online === false, onDelete: requestDelete })
  const { folder, data, readOnly } = b
  const offline = status?.online === false || data.offline

  const { reload } = data
  const { searching, refreshSearch } = b
  const refresh = useCallback(() => {
    reload()
    if (searching) refreshSearch()
  }, [reload, searching, refreshSearch])

  const focusList = useCallback(() => requestAnimationFrame(() => listRef.current?.focus({ preventScroll: true })), [])

  // --- uploads ---------------------------------------------------------------------

  const uploads = useUploads(useCallback((dir: string) => {
    // A file landing here, or in a subfolder shown here (its item count changes).
    if (dir === folder || parentOf(dir) === folder || (!folder && !dir.includes('/'))) refresh()
  }, [folder, refresh]))
  const startUpload = useCallback((files: File[], dir: string) => {
    if (readOnly) { show('Documents storage is offline', 'error'); return }
    uploads.add(files, dir)
  }, [readOnly, show, uploads])

  // --- mutations -------------------------------------------------------------------

  const newFolder = useCallback(async () => {
    if (readOnly || creating) return
    b.setSearch('')
    setCreating(true)
    try {
      const { items } = await listFolder(folder)
      const path = joinPath(folder, nextUntitledName(items.map(i => i.name)))
      await makeFolder(path)
      reload()
      b.reveal(path, { rename: true })
    } catch (e) {
      show(`Couldn’t create the folder: ${errorText(e)}`, 'error')
    } finally {
      setCreating(false)
    }
  }, [readOnly, creating, b, folder, reload, show])

  const commitRename = useCallback(async (item: DocItem, name: string): Promise<RenameResult> => {
    try {
      await renameItem(item.path, name)
    } catch (e) {
      if (e instanceof DocsApiError && e.status === 409) {
        return { fieldError: `A ${item.isDir ? 'folder' : 'file'} with that name already exists` }
      }
      return { fieldError: errorText(e) }
    }
    const path = joinPath(item.parent, name)
    data.patch(items => items.map(i => (i.path === item.path ? { ...i, name, path } : i)))
    b.reveal(path)
    refresh()
    focusList()
    return {}
  }, [data, b, refresh, focusList])

  const performMove = useCallback(async (paths: string[], target: string): Promise<boolean> => {
    if (readOnly || paths.length === 0) return false
    const errors = await runPool(paths, 2, p => moveItem(p, target))
    const moved = errors.filter(e => e == null).length
    const failed = errors.flatMap(e => (e == null ? [] : [errorText(e)]))
    const where = target ? baseName(target) : ROOT_NAME
    refresh()
    b.clearSelection()
    if (failed.length) show(moved ? `Moved ${moved}; ${failed.length} couldn’t move (${failed[0]})` : `Couldn’t move: ${failed[0]}`, 'error')
    else show(`Moved ${plural(moved, 'item')} to ${where}`)
    return failed.length === 0
  }, [readOnly, refresh, b, show])

  // --- drag and drop ----------------------------------------------------------------

  const dnd = useDocumentsDnd({
    enabled: !readOnly,
    currentFolder: folder,
    onMove: (paths, target) => void performMove(paths, target),
    onUpload: startUpload,
  })

  const { selectedItems, isSelected, selectOnly } = b
  const onDragStart = useCallback((e: React.DragEvent, item: DocItem) => {
    let items: DocItem[]
    if (isSelected(item.path)) items = selectedItems
    else {
      selectOnly(item.path)
      items = [item]
    }
    dnd.startDrag(e, {
      paths: items.map(i => i.path),
      dirs: new Set(items.filter(i => i.isDir).map(i => i.path)),
      label: items[0]?.name ?? item.name,
    })
  }, [isSelected, selectedItems, selectOnly, dnd])

  // --- menus ------------------------------------------------------------------------

  const handlers: ActionHandlers = {
    open: b.open,
    download: downloadFile,
    rename: item => b.startRename(item.path),
    move: items => setDialog({ kind: 'move', items }),
    remove: requestDelete,
    newFolder: () => void newFolder(),
    upload: () => fileInput.current?.click(),
  }
  const targetsFor = (item: DocItem) => (b.isSelected(item.path) && b.selectedCount > 1 ? b.selectedItems : [item])
  const openMenu = (item: DocItem, at: { x: number; y: number } | HTMLElement) => {
    const items = targetsFor(item)
    setMenu({ actions: buildActions(items, readOnly, handlers), at, label: items.length > 1 ? `Actions for ${items.length} items` : `Actions for ${item.name}` })
  }
  const onBlankContextMenu = (e: React.MouseEvent) => {
    if (readOnly) return
    e.preventDefault()
    b.clearSelection()
    setMenu({ actions: buildActions([], readOnly, handlers), at: { x: e.clientX, y: e.clientY }, label: 'Folder actions' })
  }

  const env: ItemEnv = {
    b,
    readOnly,
    canDrag,
    dragging: dnd.dragging,
    over: dnd.over,
    onDragStart,
    onDragEnd: dnd.endDrag,
    onMenu: openMenu,
    onCommitRename: commitRename,
  }

  // --- render -----------------------------------------------------------------------

  const summary = useMemo(() => {
    if (b.searching) {
      if (b.searchLoading) return 'Searching all folders…'
      return `${plural(b.items.length, 'result')} in all folders${b.searchTruncated ? ' (showing the first ones)' : ''}`
    }
    if (data.loading || data.error) return ' '
    const files = data.items.filter(i => !i.isDir)
    const folders = data.items.length - files.length
    const bytes = files.reduce((a, f) => a + f.size, 0)
    return [plural(files.length, 'file'), plural(folders, 'folder'), bytes ? formatBytes(bytes) : null].filter(Boolean).join(' · ')
  }, [b.searching, b.searchLoading, b.items.length, b.searchTruncated, data.loading, data.error, data.items])

  const viewerOpen = mounted && Boolean(b.viewPath)
  const showBar = b.selectedCount > 0 && !viewerOpen
  const single = b.selectedCount === 1 ? b.selectedItems[0] : null
  const dropName = dnd.over != null ? (dnd.over ? baseName(dnd.over) : ROOT_NAME) : b.folderName

  const content = () => {
    if (b.searching) {
      if (b.searchError) return <Notice title="Search failed" body={b.searchError} />
      if (b.searchLoading) return <DocumentsGridSkeleton view={b.viewMode} />
      if (b.items.length === 0) return <Notice title="No matches" body={`Nothing in Documents is called “${b.search.trim()}”.`} />
    } else {
      if (data.loading) return <DocumentsGridSkeleton view={b.viewMode} />
      if (data.notFound) {
        return (
          <Notice title="This folder isn’t here any more" body="It may have been moved, renamed or deleted.">
            <button type="button" className={`${glassBtn} mt-4`} onClick={() => b.enterFolder('')}>Go to Documents</button>
          </Notice>
        )
      }
      if (data.error) {
        return (
          <Notice title={data.offline ? 'Documents storage is offline' : 'Couldn’t load this folder'} body={data.offline ? 'The NAS share isn’t mounted. Try again in a moment.' : data.error}>
            <button type="button" className={`${glassBtn} mt-4`} onClick={() => { reload(); setStatusSeq(n => n + 1) }}>Try again</button>
          </Notice>
        )
      }
      if (data.items.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-16 text-center">
            <FolderGlyph open className="mb-2 h-[52px] w-[64px] opacity-80" />
            <p className="text-[15px] font-bold text-ink">{folder ? 'This folder is empty' : 'No documents yet'}</p>
            {!readOnly && <p className="text-[13px] text-white/50">Drag files here or use Upload.</p>}
          </div>
        )
      }
    }
    return b.viewMode === 'list' ? <DocumentsList items={b.items} env={env} /> : <DocumentsGrid items={b.items} env={env} />
  }

  return (
    <div {...dnd.zoneProps} className="relative min-h-[calc(100vh-var(--navpad))] pb-28 pl-[var(--rail)] pr-[var(--gx)] pt-16 md:pt-8">
      <header className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">Family files</p>
          <h1 className="text-[34px] font-[800] leading-none tracking-[-0.02em] text-ink md:text-[42px]" style={{ fontFamily: 'var(--font-schibsted), var(--font-manrope), sans-serif' }}>Documents</h1>
          <p className="mt-2 text-[13px] tabular-nums text-white/50" aria-live="polite">{summary}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void newFolder()} disabled={readOnly || creating} className={glassBtn}>
            <FolderPlusIcon className="h-[18px] w-[18px]" /> New Folder
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={readOnly}
            className="inline-flex h-10 items-center gap-2 rounded-[12px] px-4 text-[13.5px] font-bold text-ink-on-accent shadow-[0_10px_30px_var(--glow)] transition hover:brightness-[1.06] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            <UploadIcon className="h-4 w-4" /> Upload
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            aria-label="Choose files to upload"
            data-testid="documents-upload-input"
            onChange={e => {
              const files = e.currentTarget.files
              if (files && files.length) startUpload([...files], folder)
              e.currentTarget.value = ''
            }}
          />
        </div>
      </header>

      {offline && (
        <div role="status" className="mb-5 flex items-start gap-3 rounded-[14px] border border-[#ffb46a]/25 bg-[#ffb46a]/[0.08] px-4 py-3 text-[13.5px] text-white/80">
          <OfflineIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#ffb46a]" />
          <div>
            <p className="font-bold text-ink">Documents storage is offline (the NAS share isn’t mounted)</p>
            <p className="text-white/65">Uploads and changes are turned off until it’s back.</p>
          </div>
        </div>
      )}

      <section
        aria-label={`${b.folderName} folder`}
        className={`relative rounded-[18px] border bg-surface transition-[border-color,box-shadow] ${dnd.fileDrag ? 'border-[var(--accent)] shadow-[0_0_0_3px_var(--glow)]' : 'border-border'}`}
      >
        <div className="flex flex-col gap-2.5 border-b border-white/[0.06] px-3 py-3 md:flex-row md:items-center md:justify-between md:px-4">
          <Breadcrumbs crumbs={b.crumbs} over={dnd.over} onOpen={b.enterFolder} />
          <div className="flex items-center gap-2">
            <SearchField value={b.search} onChange={b.setSearch} loading={b.searching && b.searchLoading} />
            <SortMenu sort={b.sort} onField={b.setSortField} onDir={b.setSortDir} />
            <ViewToggle view={b.viewMode} onChange={b.setViewMode} />
          </div>
        </div>
        {b.viewMode === 'list' && b.items.length > 0 && <ListHeader sort={b.sort} onSort={b.toggleSort} />}
        <div
          ref={listRef}
          tabIndex={0}
          role="listbox"
          aria-multiselectable="true"
          aria-label={b.searching ? 'Search results' : `${b.folderName} contents`}
          aria-activedescendant={b.lead ? b.optionId(b.lead) : undefined}
          onKeyDown={b.onKeyDown}
          onClick={e => { if (!(e.target as Element).closest('[data-doc-key]')) b.clearSelection() }}
          onContextMenu={onBlankContextMenu}
          className="group/list min-h-[280px] rounded-b-[18px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/20"
        >
          {content()}
        </div>

        <AnimatePresence>
          {dnd.fileDrag && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center rounded-[18px] border-2 border-dashed border-[var(--accent)] bg-[var(--accent)]/[0.06] p-4"
            >
              <span className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-white/10 bg-[#141119]/95 py-2 pl-2.5 pr-4 text-[14px] font-semibold text-ink shadow-[0_18px_44px_rgba(0,0,0,0.55)]">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[16px] font-black leading-none text-ink-on-accent" style={{ background: 'var(--positive, #7fd8a8)' }} aria-hidden>+</span>
                Drop to add to <span className="truncate text-accent">{dropName}</span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {showBar && (
          <motion.div
            role="toolbar"
            aria-label="Selection actions"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 bottom-0 z-[46] border-t border-white/10 bg-[rgba(12,10,16,0.9)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:bottom-5 md:left-[var(--rail)] md:right-[var(--gx)] md:mx-auto md:max-w-[620px] md:rounded-[18px] md:border md:pb-0 md:shadow-[0_18px_44px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center gap-1 px-2 py-2 md:gap-2 md:px-3">
              <p className="min-w-0 flex-1 truncate px-2 text-[14px] font-bold text-ink" aria-live="polite">
                {single ? single.name : `${plural(b.selectedCount, 'item')} selected`}
              </p>
              {!readOnly && <BarButton label="Move to…" icon={<MoveIcon className="h-5 w-5" />} onClick={() => setDialog({ kind: 'move', items: b.selectedItems })} />}
              {single && !single.isDir && <BarButton label="Download" icon={<DownloadIcon className="h-5 w-5" />} onClick={() => downloadFile(single)} />}
              {!readOnly && <BarButton label="Delete" danger icon={<TrashIcon className="h-5 w-5" />} onClick={() => requestDelete(b.selectedItems)} />}
              <button type="button" onClick={b.clearSelection} aria-label="Clear selection" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/65 transition hover:bg-white/10 hover:text-white">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <UploadsPanel
        entries={uploads.entries}
        onRetry={uploads.retry}
        onKeepBoth={id => void uploads.keepBoth(id)}
        onSkip={uploads.skip}
        onCancel={uploads.cancel}
        onCancelAll={uploads.cancelAll}
        onDismiss={uploads.dismiss}
        raised={showBar}
      />

      {menu && (
        <ActionMenu
          actions={menu.actions}
          at={menu.at}
          label={menu.label}
          onClose={() => setMenu(null)}
        />
      )}

      {dialog?.kind === 'move' && (
        <MoveToDialog
          items={dialog.items}
          startFolder={folder}
          onMove={target => performMove(dialog.items.map(i => i.path), target)}
          onClose={() => { setDialog(null); focusList() }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteDialog
          items={dialog.items}
          onCancel={() => { setDialog(null); focusList() }}
          onDone={(deleted, errors) => {
            setDialog(null)
            b.clearSelection()
            refresh()
            focusList()
            if (errors.length) show(deleted.length ? `Deleted ${deleted.length}; ${errors.length} failed (${errors[0]})` : `Couldn’t delete: ${errors[0]}`, 'error')
            else show(`Deleted ${plural(deleted.length, 'item')}`)
          }}
        />
      )}

      <AnimatePresence>
        {viewerOpen && b.viewPath && (
          <DocumentViewer
            key="viewer"
            path={b.viewPath}
            files={b.files}
            nasRoot={status?.root ?? 'documents'}
            onGo={b.goViewer}
            onClose={b.closeViewer}
          />
        )}
      </AnimatePresence>

      <Toast toast={toast} />
    </div>
  )
}

function BarButton({ label, icon, onClick, danger }: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[12px] px-2.5 text-[11px] font-semibold transition md:h-10 md:flex-row md:gap-2 md:px-3.5 md:text-[13.5px] ${
        danger ? 'text-[#ff8a8a] hover:bg-[#ff6b6b]/12' : 'text-white/85 hover:bg-white/10 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function Notice({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-[15px] font-bold text-ink">{title}</p>
      <p className="mt-1 max-w-[440px] text-[13px] text-white/50">{body}</p>
      {children}
    </div>
  )
}
