'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  errorText, fetchJson, formatBytes, formatCount, monthLabel, relativeTime, runPool, startScan, trashPhoto, MONTHS,
  type PhotoSummary, type ScanStatus,
} from './api'
import { useSummary, useToast } from './hooks'
import {
  ActionButton, AlbumPickerSheet, BrowserBody, bulkFavorite, OfflineBanner, SelectionBar, Toast, usePhotoBrowser, ViewerHost,
} from './PhotoBrowser'
import { ConfirmDialog } from './Dialog'
import { Menu, menuItemClass, toolbarBtn } from './Menu'
import { MemoriesRow } from './MemoriesRow'
import { UploadSheet, useUploader } from './Uploader'
import {
  AlbumIcon, CameraIcon, CheckboxIcon, CloseIcon, HeartIcon, MoreIcon, ScanIcon, TrashIcon, UploadIcon,
} from './icons'

type KindFilter = 'all' | 'image' | 'video' | 'favorites'
type Period = { year: number; month?: number } | null

const CHIPS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Photos' },
  { value: 'video', label: 'Videos' },
  { value: 'favorites', label: 'Favorites' },
]

function buildQuery(kind: KindFilter, period: Period): string {
  const q = new URLSearchParams()
  if (kind === 'image' || kind === 'video') q.set('kind', kind)
  if (kind === 'favorites') q.set('favorite', '1')
  if (period) {
    q.set('year', String(period.year))
    if (period.month) q.set('month', String(period.month))
  }
  return q.toString()
}

/** /media/photos — the library timeline. */
export function PhotosTimeline() {
  const [kind, setKind] = useState<KindFilter>('all')
  const [period, setPeriod] = useState<Period>(null)
  const query = useMemo(() => buildQuery(kind, period), [kind, period])
  const b = usePhotoBrowser('/api/photos', query)
  const { summary, reload: reloadSummary } = useSummary()
  const { toast, show } = useToast()
  const [picker, setPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const { reload: reloadPages } = b
  const refreshAll = useCallback(() => { reloadPages(); reloadSummary() }, [reloadPages, reloadSummary])

  const uploader = useUploader(useCallback((created: number) => {
    if (created > 0) {
      refreshAll()
      show(`Added ${formatCount(created, 'item')} to the library`)
    }
  }, [refreshAll, show]))

  // Drag-and-drop files anywhere on the page (desktop).
  const [dragging, setDragging] = useState(false)
  const { start: startUpload } = uploader
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes('Files'))
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; setDragging(true) }
    const over = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy' }
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (depth === 0) setDragging(false) }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const files = e.dataTransfer?.files
      if (files && files.length) void startUpload(files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [startUpload])

  // Scan: POST, then poll status until it finishes; refresh the grid afterwards.
  const [scan, setScan] = useState<ScanStatus | null>(null)
  const scanning = Boolean(scan?.running)
  useEffect(() => {
    if (!scanning) return
    const ctrl = new AbortController()
    const timer = window.setInterval(() => {
      fetchJson<ScanStatus>('/api/photos/scan', { signal: ctrl.signal })
        .then(s => {
          setScan(s)
          if (!s.running) {
            refreshAll()
            show(s.error ? `Scan failed: ${s.error}` : `Scan finished · ${s.added} added, ${s.updated} updated`, s.error ? 'error' : 'ok')
          }
        })
        .catch(() => {})
    }, 1500)
    return () => { window.clearInterval(timer); ctrl.abort() }
  }, [scanning, refreshAll, show])
  const runScan = async () => {
    try {
      const s = await startScan()
      setScan({ ...s, running: true })
      show(s.libraryOnline ? 'Scanning the library…' : 'Library offline — scan skipped', s.libraryOnline ? 'ok' : 'error')
      if (!s.libraryOnline) setScan(null)
    } catch (e) {
      show(errorText(e), 'error')
    }
  }

  const ids = [...b.sel.selected]
  const deleteSelected = async () => {
    setBusy(true)
    const ok = await runPool(ids, 4, id => trashPhoto(id))
    const gone = ids.filter((_, i) => ok[i])
    b.removeItems(gone)
    b.sel.clear()
    setBusy(false)
    setConfirmDelete(false)
    reloadSummary()
    const failed = ids.length - gone.length
    show(failed ? `${failed} couldn't be deleted` : `Moved ${formatCount(gone.length, 'item')} to Recently deleted`, failed ? 'error' : 'ok')
  }

  const offline = summary?.libraryOnline === false || b.offline
  const emptyLibrary = summary?.total === 0 && kind === 'all' && !period
  const filtered = kind !== 'all' || period != null

  return (
    <div className="pb-24 pl-[var(--rail)] pr-[var(--gx)] pt-16 md:pt-8">
      <header className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">Family library</p>
          <h1 className="text-[34px] font-[800] leading-none tracking-[-0.02em] text-ink md:text-[42px]">Photos</h1>
          <p className="mt-2 text-[13px] text-white/50" aria-live="polite">
            {summary
              ? `${formatCount(summary.images, 'photo')} · ${formatCount(summary.videos, 'video')}${summary.favorites ? ` · ${formatCount(summary.favorites, 'favourite')}` : ''}`
              : ' '}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploader.running || summary?.libraryOnline === false}
            title={summary?.libraryOnline === false ? 'The library is offline' : undefined}
            className="inline-flex h-10 items-center gap-2 rounded-[12px] px-4 text-[13.5px] font-bold text-ink-on-accent shadow-[0_10px_30px_var(--glow)] transition hover:brightness-[1.06] disabled:opacity-60"
            style={{ background: 'var(--accent)' }}
          >
            <UploadIcon className="h-4 w-4" /> Upload
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            aria-label="Choose photos and videos to upload"
            data-testid="photos-upload-input"
            onChange={e => {
              const files = e.currentTarget.files
              if (files && files.length) void uploader.start(files)
              e.currentTarget.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => (b.sel.active ? b.sel.clear() : b.sel.start())}
            aria-pressed={b.sel.active}
            className={toolbarBtn}
          >
            <CheckboxIcon className="h-4 w-4" checked={b.sel.active} /> Select
          </button>
          <Menu
            label="More photo options"
            trigger={<MoreIcon className="h-5 w-5" />}
            triggerClassName="grid h-10 w-10 place-items-center rounded-[12px] border border-white/10 bg-white/[0.06] text-ink transition hover:bg-white/[0.12]"
          >
            {close => (
              <>
                <Link role="menuitem" href="/media/photos/albums" className={menuItemClass} onClick={close}>
                  <AlbumIcon className="h-[18px] w-[18px] text-white/60" /> Albums
                </Link>
                <Link role="menuitem" href="/media/photos/trash" className={menuItemClass} onClick={close}>
                  <TrashIcon className="h-[18px] w-[18px] text-white/60" />
                  <span className="flex-1">Recently deleted</span>
                  {summary && summary.trashCount > 0 && <span className="text-[12px] text-white/45">{summary.trashCount}</span>}
                </Link>
                <button role="menuitem" type="button" className={menuItemClass} disabled={scanning} onClick={() => { close(); void runScan() }}>
                  <ScanIcon className={`h-[18px] w-[18px] text-white/60 ${scanning ? 'animate-spin' : ''}`} />
                  {scanning ? `Scanning… ${scan?.processed ? `(${scan.processed})` : ''}` : 'Scan library'}
                </button>
                {summary && <LibraryStats summary={summary} />}
              </>
            )}
          </Menu>
        </div>
      </header>

      {offline && <OfflineBanner />}

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter">
        {CHIPS.map(c => {
          const on = kind === c.value
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={on}
              onClick={() => setKind(c.value)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold transition ${on ? 'text-ink-on-accent' : 'bg-white/[0.06] text-white/75 hover:bg-white/[0.11]'}`}
              style={on ? { background: 'var(--accent)' } : undefined}
            >
              {c.value === 'favorites' && <HeartIcon className="h-3.5 w-3.5" fill={on ? 'currentColor' : 'none'} />}
              {c.label}
            </button>
          )
        })}
        {summary && summary.years.length > 1 && (
          <YearSelect summary={summary} period={period} onPick={setPeriod} />
        )}
        {period && (
          <button
            type="button"
            onClick={() => setPeriod(null)}
            aria-label={`Clear ${period.month ? monthLabel(period.year, period.month) : period.year} filter`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--accent)]/40 bg-white/[0.04] pl-3.5 pr-2.5 text-[13.5px] font-semibold text-accent"
          >
            {period.month ? monthLabel(period.year, period.month) : period.year}
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Row/SectionHeader carry the page gutters themselves; undo this page's. */}
      {!offline && kind === 'all' && !period && (
        <div className="ml-[calc(var(--rail)*-1)] mr-[calc(var(--gx)*-1)]">
          <MemoriesRow onThisDayOnly />
        </div>
      )}

      <div className="flex gap-8">
        <div className="min-w-0 flex-1">
          <BrowserBody
            b={b}
            empty={emptyLibrary ? (
              <EmptyLibrary onUpload={() => fileInput.current?.click()} offline={offline} />
            ) : (
              <div className="rounded-[16px] border border-border bg-surface px-5 py-10 text-center">
                <p className="text-[15px] font-semibold text-ink">{kind === 'favorites' ? 'No favourites here yet' : 'Nothing here'}</p>
                <p className="mt-1 text-[13px] text-white/50">
                  {kind === 'favorites' ? 'Tap the heart on a photo to keep it here.' : filtered ? 'Try another filter.' : ''}
                </p>
              </div>
            )}
          />
        </div>
        {summary && summary.years.length > 0 && (
          <JumpList summary={summary} period={period} onPick={setPeriod} />
        )}
      </div>

      <SelectionBar b={b} viewerOpen={Boolean(b.viewer.viewerId)}>
        <ActionButton label="Favorite" icon={<HeartIcon className="h-5 w-5" />} disabled={ids.length === 0} onClick={() => void bulkFavorite(b, show)} />
        <ActionButton label="Add to album" icon={<AlbumIcon className="h-5 w-5" />} disabled={ids.length === 0} onClick={() => setPicker(true)} />
        <ActionButton label="Delete" danger icon={<TrashIcon className="h-5 w-5" />} disabled={ids.length === 0} onClick={() => setConfirmDelete(true)} />
      </SelectionBar>

      {picker && (
        <AlbumPickerSheet
          ids={ids}
          onClose={() => setPicker(false)}
          onDone={(t, tone) => { show(t, tone); if (tone !== 'error') b.sel.clear() }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${formatCount(ids.length, 'item')}?`}
          body="They move to Recently deleted, where you can restore them until the trash is emptied."
          confirmLabel="Delete"
          busy={busy}
          onConfirm={() => void deleteSelected()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      <ViewerHost b={b} onChanged={reloadSummary} />
      <UploadSheet entries={uploader.entries} running={uploader.running} onCancel={uploader.cancel} onDismiss={uploader.dismiss} />
      <Toast toast={toast} />

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-[85] grid place-items-center bg-[rgba(4,3,8,0.7)] p-6 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-3 rounded-[22px] border-2 border-dashed border-[var(--accent)] px-12 py-10 text-center">
              <UploadIcon className="h-10 w-10 text-accent" />
              <p className="text-[20px] font-bold text-ink">Drop to upload</p>
              <p className="text-[13px] text-white/55">Photos and videos are added to the family library.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function LibraryStats({ summary }: { summary: PhotoSummary }) {
  const d = summary.diskUsage
  return (
    <div className="mt-1.5 border-t border-white/[0.07] px-3 pb-1.5 pt-3 text-[12.5px] text-white/60">
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40">Library</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt>Items</dt><dd className="text-right text-white/85">{summary.total.toLocaleString('en-GB')}</dd>
        <dt>Originals</dt><dd className="text-right text-white/85">{formatBytes(d.libraryBytes)}</dd>
        {d.trashBytes > 0 && <><dt>In trash</dt><dd className="text-right text-white/85">{formatBytes(d.trashBytes)}</dd></>}
        {d.totalBytes > 0 && <><dt>Free on share</dt><dd className="text-right text-white/85">{formatBytes(d.freeBytes)} of {formatBytes(d.totalBytes)}</dd></>}
        <dt>Last scan</dt><dd className="text-right text-white/85">{summary.scanning ? 'Running…' : summary.lastScan ? relativeTime(summary.lastScan) : 'Never'}</dd>
      </dl>
      {d.totalBytes > 0 && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((d.totalBytes - d.freeBytes) / d.totalBytes) * 100)}%`, background: 'var(--accent)' }} />
        </div>
      )}
    </div>
  )
}

/** Desktop year/month jump list: picking one filters the timeline to that period. */
function JumpList({ summary, period, onPick }: { summary: PhotoSummary; period: Period; onPick: (p: Period) => void }) {
  const openYear = period?.year ?? null
  return (
    <nav aria-label="Jump to date" className="sticky top-4 hidden max-h-[calc(100vh-2rem)] w-[148px] shrink-0 self-start overflow-y-auto pb-4 lg:block">
      <button
        type="button"
        onClick={() => onPick(null)}
        aria-current={period == null ? 'true' : undefined}
        className={`mb-1 w-full rounded-[10px] px-3 py-1.5 text-left text-[13px] font-semibold transition hover:bg-white/[0.07] ${period == null ? 'text-accent' : 'text-white/60'}`}
      >
        All time
      </button>
      {summary.years.map(y => {
        const months = summary.months.filter(m => m.year === y.year)
        const yearOn = openYear === y.year && !period?.month
        return (
          <div key={y.year}>
            <button
              type="button"
              onClick={() => onPick({ year: y.year })}
              aria-current={yearOn ? 'true' : undefined}
              className={`flex w-full items-baseline justify-between rounded-[10px] px-3 py-1.5 text-left transition hover:bg-white/[0.07] ${yearOn ? 'text-accent' : 'text-ink'}`}
            >
              <span className="text-[15px] font-bold" style={{ fontFamily: 'var(--font-schibsted), var(--font-manrope), sans-serif' }}>{y.year}</span>
              <span className="text-[11px] text-white/40">{y.count}</span>
            </button>
            {openYear === y.year && (
              <ul className="mb-1.5 ml-2 border-l border-white/10 pl-1">
                {months.map(m => {
                  const on = period?.month === m.month
                  return (
                    <li key={m.month}>
                      <button
                        type="button"
                        onClick={() => onPick({ year: m.year, month: m.month })}
                        aria-current={on ? 'true' : undefined}
                        aria-label={`${monthLabel(m.year, m.month)}, ${m.count} items`}
                        className={`flex w-full items-baseline justify-between rounded-[8px] px-2.5 py-1 text-left text-[12.5px] transition hover:bg-white/[0.07] ${on ? 'font-bold text-accent' : 'text-white/65'}`}
                      >
                        <span>{MONTHS[m.month - 1].slice(0, 3)}</span>
                        <span className="text-[11px] text-white/35">{m.count}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}

/** Compact year picker for phones/tablets (the jump list is desktop-only). */
function YearSelect({ summary, period, onPick }: { summary: PhotoSummary; period: Period; onPick: (p: Period) => void }) {
  return (
    <label className="relative inline-flex lg:hidden">
      <span className="sr-only">Year</span>
      <select
        value={period ? String(period.year) : ''}
        onChange={e => onPick(e.target.value ? { year: Number(e.target.value) } : null)}
        className="h-9 appearance-none rounded-full bg-white/[0.06] pl-4 pr-8 text-[13.5px] font-semibold text-white/75 outline-none transition hover:bg-white/[0.11] focus-visible:ring-2 focus-visible:ring-[var(--accent)] md:text-[13.5px]"
        style={{ fontSize: 13.5 }}
      >
        <option value="">All years</option>
        {summary.years.map(y => <option key={y.year} value={y.year}>{y.year} · {y.count}</option>)}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/50">▼</span>
    </label>
  )
}

function EmptyLibrary({ onUpload, offline }: { onUpload: () => void; offline: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-[22px] border border-border bg-surface px-6 py-14 text-center">
      <span className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-white/[0.06] text-accent">
        <CameraIcon className="h-8 w-8" />
      </span>
      <h2 className="text-[22px] font-bold text-ink">Your family library is empty</h2>
      <p className="mt-2 max-w-[440px] text-[14px] leading-relaxed text-white/55">
        Upload photos and videos here{offline ? ' once the library is back online' : ''}, or copy them into the NAS photo share and run a scan from the ⋯ menu.
        <span className="hidden md:inline"> You can also drop files anywhere on this page.</span>
      </p>
      {!offline && (
        <button type="button" onClick={onUpload} className="mt-5 inline-flex h-11 items-center gap-2 rounded-[12px] px-5 text-[14px] font-bold text-ink-on-accent shadow-[0_10px_30px_var(--glow)]" style={{ background: 'var(--accent)' }}>
          <UploadIcon className="h-4 w-4" /> Upload photos
        </button>
      )}
    </div>
  )
}
