'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { addToAlbum, createAlbum, errorText, formatCount, runPool, setFavorite, type PhotoItem } from './api'
import { useAlbums, useMounted, usePhotoPages, useSelection, useViewerParam } from './hooks'
import { GridSkeleton, LoadMoreSentinel, PhotoGrid, Thumb } from './PhotoGrid'
import { PhotoViewer, type ViewerMode } from './PhotoViewer'
import { Dialog } from './Dialog'
import { AlbumIcon, OfflineIcon, PlusIcon } from './icons'

/** Paged list + selection + `?v=` viewer state for one grid (timeline, album, trash). */
export function usePhotoBrowser(endpoint: string, query: string) {
  const pages = usePhotoPages(endpoint, query)
  const sel = useSelection(pages.items)
  const viewer = useViewerParam()
  return { ...pages, sel, viewer }
}
export type PhotoBrowser = ReturnType<typeof usePhotoBrowser>

/** Grid body: skeleton → error / empty → month-sectioned grid with infinite scroll. */
export function BrowserBody({ b, sections = true, empty, badge }: {
  b: PhotoBrowser
  sections?: boolean
  empty: React.ReactNode
  badge?: (item: PhotoItem) => React.ReactNode
}) {
  if (b.loading) return <GridSkeleton count={24} />
  if (b.error && b.items.length === 0) {
    return (
      <div role="alert" className="rounded-[16px] border border-border bg-surface px-5 py-8 text-center text-[14px] text-white/65">
        {b.offline ? 'The photo library is offline.' : `Couldn't load photos: ${b.error}`}
        <div className="pt-3">
          <button type="button" onClick={b.reload} className="rounded-[12px] border border-white/10 bg-white/[0.06] px-4 py-2 text-[13.5px] font-semibold text-ink hover:bg-white/[0.12]">Try again</button>
        </div>
      </div>
    )
  }
  if (b.items.length === 0) return <>{empty}</>
  return (
    <>
      <PhotoGrid
        items={b.items}
        sections={sections}
        selecting={b.sel.active}
        selected={b.sel.selected}
        onOpen={b.viewer.open}
        onToggle={b.sel.toggle}
        badge={badge}
      />
      <LoadMoreSentinel onVisible={b.loadMore} armed={b.hasMore && !b.loadingMore} version={b.items.length} />
      {b.loadingMore && (
        <div className="flex justify-center py-6" aria-label="Loading more">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
        </div>
      )}
    </>
  )
}

/** Mounts the lightbox while `?v=` is set (client only: it depends on browser APIs). */
export function ViewerHost({ b, mode = 'library', onChanged }: { b: PhotoBrowser; mode?: ViewerMode; onChanged?: () => void }) {
  const mounted = useMounted()
  const { viewerId, go, close } = b.viewer
  const { patchItems, removeItems, loadMore } = b
  const onItemChange = useCallback((id: string, patch: Partial<PhotoItem>) => {
    patchItems([id], patch)
    onChanged?.()
  }, [patchItems, onChanged])
  const onRemoved = useCallback((id: string) => {
    removeItems([id])
    onChanged?.()
  }, [removeItems, onChanged])
  return (
    <AnimatePresence>
      {mounted && viewerId && (
        <PhotoViewer
          key="viewer"
          id={viewerId}
          items={b.items}
          mode={mode}
          hasMore={b.hasMore}
          onNeedMore={loadMore}
          onGo={go}
          onClose={close}
          onItemChange={onItemChange}
          onRemoved={onRemoved}
        />
      )}
    </AnimatePresence>
  )
}

/** Bottom action bar for selection mode; covers the mobile tab bar. Esc cancels, ⌘A selects all. */
export function SelectionBar({ b, children, viewerOpen }: { b: PhotoBrowser; children: React.ReactNode; viewerOpen?: boolean }) {
  const { active, selected, clear, selectAll } = b.sel
  useEffect(() => {
    if (!active || viewerOpen) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (document.querySelector('[aria-modal="true"]')) return
      if (e.key === 'Escape') { e.preventDefault(); clear() }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, viewerOpen, clear, selectAll])

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          role="toolbar"
          aria-label="Selection actions"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-x-0 bottom-0 z-[46] border-t border-white/10 bg-[rgba(12,10,16,0.88)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:bottom-5 md:left-[calc(var(--rail)+0px)] md:right-[var(--gx)] md:mx-auto md:max-w-[760px] md:rounded-[18px] md:border md:pb-0 md:shadow-[0_18px_44px_rgba(0,0,0,0.55)]"
        >
          <div className="flex items-center gap-1 px-2 py-2 md:gap-2 md:px-3">
            <div className="min-w-0 shrink-0 px-2" aria-live="polite">
              <p className="text-[14px] font-bold text-ink">{selected.size === 0 ? 'Select items' : `${selected.size.toLocaleString('en-GB')} selected`}</p>
              <button type="button" onClick={selectAll} className="text-[11.5px] font-semibold text-accent hover:underline">
                Select all {b.hasMore ? 'loaded' : `(${b.items.length})`}
              </button>
            </div>
            <div className="scrollbar-hide flex min-w-0 flex-1 items-center justify-end gap-0.5 overflow-x-auto md:gap-1">
              {children}
              <ActionButton label="Cancel" onClick={clear} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ActionButton({ label, icon, onClick, disabled, danger }: {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-12 min-w-[56px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[12px] px-2 text-[11px] font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35 md:h-10 md:flex-row md:gap-1.5 md:px-3 md:text-[13px] ${danger ? 'text-[#ff8a8a]' : 'text-white/85'}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

/** Favorite / unfavorite the selection (unfavorites when every selected item is a favorite). */
export async function bulkFavorite(b: PhotoBrowser, toast: (t: string, tone?: 'ok' | 'error') => void) {
  const ids = [...b.sel.selected]
  if (ids.length === 0) return
  const byId = new Map(b.items.map(i => [i.id, i]))
  const want = !ids.every(id => byId.get(id)?.favorite)
  b.patchItems(ids, { favorite: want })
  const ok = await runPool(ids, 6, id => setFavorite(id, want))
  const failed = ids.filter((_, i) => !ok[i])
  if (failed.length) {
    b.patchItems(failed, { favorite: !want })
    toast(`${failed.length} couldn't be updated`, 'error')
  } else {
    toast(want ? `Added ${formatCount(ids.length, 'item')} to favourites` : `Removed ${formatCount(ids.length, 'item')} from favourites`)
  }
  b.sel.clear()
}

/** "Add to album" sheet: existing albums + inline "New album". */
export function AlbumPickerSheet({ ids, onClose, onDone, excludeAlbum }: {
  ids: string[]
  onClose: () => void
  onDone: (text: string, tone?: 'ok' | 'error') => void
  excludeAlbum?: string
}) {
  const { albums, error, loading } = useAlbums(true)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const list = albums?.filter(a => a.id !== excludeAlbum) ?? []

  const pick = async (id: string, label: string) => {
    setBusy(true)
    try {
      const r = await addToAlbum(id, ids)
      onDone(r.added > 0 ? `Added ${formatCount(r.added, 'item')} to ${label}` : `Already in ${label}`)
      onClose()
    } catch (e) {
      onDone(errorText(e), 'error')
      setBusy(false)
    }
  }
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    try {
      const a = await createAlbum(n, ids)
      onDone(`Created ${a.name} with ${formatCount(a.count, 'item')}`)
      onClose()
    } catch (err) {
      onDone(errorText(err), 'error')
      setBusy(false)
    }
  }

  return (
    <Dialog title={`Add ${formatCount(ids.length, 'item')} to album`} onClose={onClose} wide initialFocus="input">
      <form onSubmit={create} className="mb-3 flex gap-2">
        <label className="sr-only" htmlFor="new-album-name">New album name</label>
        <input
          id="new-album-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="New album…"
          maxLength={200}
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-[12px] border border-white/10 bg-white/[0.06] px-3.5 text-[15px] text-ink outline-none transition placeholder:text-white/35 focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={!name.trim() || busy}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[12px] px-4 text-[14px] font-semibold text-ink-on-accent transition disabled:opacity-45"
          style={{ background: 'var(--accent)' }}
        >
          <PlusIcon className="h-4 w-4" /> Create
        </button>
      </form>
      {loading && <p className="py-4 text-center text-[13px] text-white/45">Loading albums…</p>}
      {error && <p role="alert" className="py-2 text-[13px] text-[#ff8a8a]">{error}</p>}
      {!loading && list.length === 0 && !error && <p className="py-4 text-center text-[13px] text-white/45">No albums yet — name one above.</p>}
      <ul className="space-y-1">
        {list.map(a => (
          <li key={a.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void pick(a.id, a.name)}
              className="flex w-full items-center gap-3 rounded-[12px] p-2 text-left transition hover:bg-white/[0.07] disabled:opacity-50"
            >
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[10px] bg-white/[0.06]">
                {a.coverId ? <Thumb item={{ id: a.coverId, size: 0 }} /> : <AlbumIcon className="absolute inset-0 m-auto h-5 w-5 text-white/40" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold text-ink">{a.name}</span>
                <span className="block text-[12px] text-white/45">{formatCount(a.count, 'item')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

/** "Library offline" banner — the NAS share isn't mounted. */
export function OfflineBanner() {
  return (
    <div role="status" className="mb-5 flex items-start gap-3 rounded-[14px] border border-[#ffb46a]/25 bg-[#ffb46a]/[0.08] px-4 py-3 text-[13.5px] text-white/80">
      <OfflineIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#ffb46a]" />
      <div>
        <p className="font-bold text-ink">Library offline</p>
        <p className="text-white/65">The NAS photo share isn&apos;t mounted. You can browse what&apos;s already indexed, but originals, new thumbnails and uploads are unavailable until it&apos;s back.</p>
      </div>
    </div>
  )
}

/** Small toast pinned above the selection bar / tab bar. */
export function Toast({ toast }: { toast: { id: number; text: string; tone: 'ok' | 'error' } | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--navpad)+84px)] z-[75] flex justify-center px-4 md:bottom-24">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`rounded-full border px-4 py-2 text-[13.5px] font-semibold shadow-[0_18px_44px_rgba(0,0,0,0.55)] backdrop-blur-xl ${toast.tone === 'error' ? 'border-[#ff8a8a]/30 bg-[#2a1216]/90 text-[#ffb3b3]' : 'border-white/10 bg-[#141119]/90 text-ink'}`}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
