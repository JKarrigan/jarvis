'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ROOT_NAME, formatBytes, pathLabel } from './api'
import { fileKind } from './fileKinds'
import { FileGlyph, FolderGlyph, CheckIcon, RetryIcon, AlertIcon } from './icons'
import { ChevronDownIcon, CloseIcon } from '../photos/icons'
import { IN_FLIGHT, type UploadEntry } from './useUploads'

const ICON_BTN = 'grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-40'
const PILL = 'inline-flex h-7 items-center rounded-full px-3 text-[12px] font-bold transition'

/** Counts for the panel header: stable totals over the batch (skipped / cancelled files leave it). */
export function uploadSummary(entries: readonly UploadEntry[]) {
  const active = entries.filter(e => e.state !== 'skipped' && e.state !== 'cancelled')
  const done = active.filter(e => e.state === 'done').length
  const inFlight = active.filter(e => IN_FLIGHT.has(e.state)).length
  const conflicts = active.filter(e => e.state === 'conflict').length
  const errors = active.filter(e => e.state === 'error').length
  let sent = 0
  let bytes = 0
  for (const e of active) {
    bytes += e.total
    sent += e.state === 'done' ? e.total : e.loaded
  }
  return { total: active.length, done, inFlight, conflicts, errors, sent, bytes }
}

/**
 * Floating upload queue, bottom-right (full width above the tab bar on phones): a stable
 * summary ("Uploading 12 of 30 · 4.2 MB of 18 MB") with an overall bar, a collapsible
 * per-file list grouped by folder for folder drops, Keep both / Skip on a name clash
 * (and for all clashes at once), Retry on errors, Cancel all. `raised` lifts it above
 * the selection bar.
 */
export function UploadsPanel({ entries, onRetry, onKeepBoth, onKeepBothAll, onSkip, onSkipAll, onCancel, onCancelAll, onDismiss, raised }: {
  entries: UploadEntry[]
  onRetry: (id: string) => void
  onKeepBoth: (id: string) => void
  onKeepBothAll: () => void
  onSkip: (id: string) => void
  onSkipAll: () => void
  onCancel: (id: string) => void
  onCancelAll: () => void
  onDismiss: () => void
  raised: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const s = uploadSummary(entries)
  const attention = s.conflicts + s.errors
  const title = s.inFlight
    ? `Uploading ${Math.min(s.total, s.done + 1)} of ${s.total}`
    : attention
      ? `${attention} upload${attention === 1 ? '' : 's'} need${attention === 1 ? 's' : ''} attention`
      : `Uploaded ${s.done} file${s.done === 1 ? '' : 's'}`
  const pct = s.bytes ? Math.round((s.sent / s.bytes) * 100) : s.total ? Math.round((s.done / s.total) * 100) : 0

  // Group by folder (a folder drop spans several); one group needs no headers.
  const groups: { dir: string; root: string; items: UploadEntry[] }[] = []
  for (const e of entries) {
    const g = groups.find(x => x.dir === e.dir)
    if (g) g.items.push(e)
    else groups.push({ dir: e.dir, root: e.root, items: [e] })
  }
  const grouped = groups.length > 1

  return (
    <AnimatePresence>
      {entries.length > 0 && (
        <motion.section
          aria-label="Uploads"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className={`fixed inset-x-3 z-[47] overflow-hidden rounded-[18px] border border-white/10 bg-[#141119]/95 shadow-[0_18px_44px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-[bottom] md:inset-x-auto md:right-[max(16px,calc(var(--gx)-24px))] md:w-[360px] ${
            raised ? 'bottom-[calc(env(safe-area-inset-bottom)+76px)] md:bottom-24' : 'bottom-[calc(var(--navpad)+10px)] md:bottom-5'
          }`}
        >
          <div className="border-b border-white/[0.07]">
            <div className="flex items-center gap-1 py-2 pl-4 pr-2">
              <p className="min-w-0 flex-1 truncate text-[13.5px] font-bold tabular-nums text-ink" data-testid="uploads-summary">
                <span aria-live="polite">{title}</span>
                {s.inFlight > 0 && s.bytes > 0 && (
                  <span className="text-[12.5px] font-semibold text-white/50"> · {formatBytes(s.sent)} of {formatBytes(s.bytes)}</span>
                )}
              </p>
              <button
                type="button"
                onClick={() => setCollapsed(c => !c)}
                aria-label={collapsed ? 'Show uploads' : 'Hide uploads'}
                aria-expanded={!collapsed}
                aria-controls="documents-uploads-list"
                className={ICON_BTN}
              >
                <ChevronDownIcon className={`h-4 w-4 transition-transform motion-reduce:transition-none ${collapsed ? 'rotate-180' : ''}`} />
              </button>
              <button
                type="button"
                onClick={onDismiss}
                disabled={s.inFlight > 0}
                aria-label="Close uploads"
                title={s.inFlight > 0 ? 'Uploads are still running' : undefined}
                className={ICON_BTN}
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            {s.inFlight > 0 && (
              <div className="-mt-1 flex items-center gap-3 pb-2 pl-4 pr-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.1]" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <div className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
                </div>
                <button type="button" onClick={onCancelAll} className={`${PILL} shrink-0 text-white/70 hover:bg-white/10 hover:text-white`}>Cancel all</button>
              </div>
            )}
            {s.conflicts > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] px-4 py-2">
                <span className="mr-auto text-[12px] font-semibold text-[#ffcf8a]">{s.conflicts} names already exist</span>
                <button type="button" onClick={onKeepBothAll} className={`${PILL} text-ink-on-accent hover:brightness-110`} style={{ background: 'var(--accent)' }}>Keep both for all</button>
                <button type="button" onClick={onSkipAll} className={`${PILL} border border-white/10 bg-white/[0.06] text-ink hover:bg-white/[0.12]`}>Skip all</button>
              </div>
            )}
          </div>
          {!collapsed && (
            <ul id="documents-uploads-list" className="max-h-[min(46vh,340px)] overflow-y-auto py-1">
              {groups.map(g => (
                <li key={g.dir}>
                  {grouped && <GroupHeader dir={g.dir} root={g.root} items={g.items} />}
                  <ul>
                    {g.items.map(e => (
                      <UploadRow key={e.id} e={e} onRetry={onRetry} onKeepBoth={onKeepBoth} onSkip={onSkip} onCancel={onCancel} showWhere={!grouped} />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  )
}

/** "Trip › Day 1" relative to where the folder was dropped ("Documents" at the root). */
function groupLabel(dir: string, root: string): string {
  if (dir === root) return root ? root.slice(root.lastIndexOf('/') + 1) : ROOT_NAME
  const rel = root && dir.startsWith(`${root}/`) ? dir.slice(root.length + 1) : dir
  return rel.split('/').join(' › ')
}

function GroupHeader({ dir, root, items }: { dir: string; root: string; items: UploadEntry[] }) {
  const done = items.filter(e => e.state === 'done').length
  const counted = items.filter(e => e.state !== 'skipped' && e.state !== 'cancelled').length
  return (
    <div className="sticky top-0 z-[1] flex items-center gap-2 bg-[#141119] px-4 pb-1 pt-2 text-[11.5px] font-bold text-white/60" title={pathLabel(dir)}>
      <FolderGlyph className="h-[14px] w-[18px] shrink-0" />
      <span className="min-w-0 flex-1 truncate">{groupLabel(dir, root)}</span>
      <span className="shrink-0 tabular-nums text-white/40">{done} of {counted}</span>
    </div>
  )
}

function UploadRow({ e, onRetry, onKeepBoth, onSkip, onCancel, showWhere }: {
  e: UploadEntry
  onRetry: (id: string) => void
  onKeepBoth: (id: string) => void
  onSkip: (id: string) => void
  onCancel: (id: string) => void
  showWhere: boolean
}) {
  const pct = e.total ? Math.round((e.loaded / e.total) * 100) : e.state === 'done' ? 100 : 0
  const where = e.dir ? e.dir.slice(e.dir.lastIndexOf('/') + 1) : ROOT_NAME
  return (
    <li className="flex items-start gap-3 px-4 py-2" data-upload-row={e.state}>
      <FileGlyph kind={fileKind({ isDir: false, name: e.name })} className="mt-0.5 h-[26px] w-[21px] shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[13px] font-semibold text-ink" title={e.name}>{e.name}</span>
        {e.state === 'queued' && <span className="text-[11.5px] text-white/45">{e.error ?? (showWhere ? `Waiting… · to ${where}` : 'Waiting…')}</span>}
        {e.state === 'uploading' && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.12]" role="progressbar" aria-label={`Uploading ${e.name}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
            </div>
            <span className="w-9 text-right text-[11px] tabular-nums text-white/50">{pct}%</span>
          </div>
        )}
        {e.state === 'done' && (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--positive,#7fd8a8)]">
            <CheckIcon className="h-3.5 w-3.5" /> {showWhere ? `Added to ${where}` : 'Added'}
          </span>
        )}
        {e.state === 'conflict' && (
          <>
            <span className="text-[11.5px] leading-snug text-[#ffcf8a]">{e.error}</span>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => onKeepBoth(e.id)} className={`${PILL} text-ink-on-accent hover:brightness-110`} style={{ background: 'var(--accent)' }}>Keep both</button>
              <button type="button" onClick={() => onSkip(e.id)} className={`${PILL} border border-white/10 bg-white/[0.06] text-ink hover:bg-white/[0.12]`}>Skip</button>
            </div>
          </>
        )}
        {e.state === 'error' && (
          <span className="inline-flex items-center gap-1 text-[11.5px] leading-snug text-[#ff8a8a]"><AlertIcon className="h-3.5 w-3.5 shrink-0" /> {e.error}</span>
        )}
        {e.state === 'skipped' && <span className="text-[11.5px] text-white/40">Skipped</span>}
        {e.state === 'cancelled' && <span className="text-[11.5px] text-white/40">Cancelled</span>}
      </div>
      {(e.state === 'uploading' || e.state === 'queued') && (
        <button type="button" onClick={() => onCancel(e.id)} aria-label={`Cancel ${e.name}`} className={ICON_BTN}>
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      )}
      {(e.state === 'error' || e.state === 'cancelled') && (
        <button type="button" onClick={() => onRetry(e.id)} aria-label={`Retry ${e.name}`} title="Retry" className={ICON_BTN}>
          <RetryIcon className="h-4 w-4" />
        </button>
      )}
    </li>
  )
}
