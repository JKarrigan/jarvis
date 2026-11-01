'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { formatBytes, pathLabel } from './api'
import { fileKind } from './fileKinds'
import { FileGlyph, CheckIcon, RetryIcon, AlertIcon } from './icons'
import { ChevronDownIcon, CloseIcon } from '../photos/icons'
import { IN_FLIGHT, type UploadEntry } from './useUploads'

const ICON_BTN = 'grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-40'
const PILL = 'inline-flex h-7 items-center rounded-full px-3 text-[12px] font-bold transition'

/**
 * Floating upload queue, bottom-right (full width above the tab bar on phones): per-file
 * progress, Keep both / Skip on a name conflict, Retry on errors, Cancel all.
 * `raised` lifts it above the selection bar.
 */
export function UploadsPanel({ entries, onRetry, onKeepBoth, onSkip, onCancel, onCancelAll, onDismiss, raised }: {
  entries: UploadEntry[]
  onRetry: (id: string) => void
  onKeepBoth: (id: string) => void
  onSkip: (id: string) => void
  onCancel: (id: string) => void
  onCancelAll: () => void
  onDismiss: () => void
  raised: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const total = entries.length
  const inFlight = entries.filter(e => IN_FLIGHT.has(e.state)).length
  const attention = entries.filter(e => e.state === 'conflict' || e.state === 'error').length
  const done = entries.filter(e => e.state === 'done').length
  const bytes = entries.filter(e => IN_FLIGHT.has(e.state)).reduce((a, e) => [a[0] + e.loaded, a[1] + e.total], [0, 0])
  const title = inFlight
    ? `Uploading ${Math.min(total, total - inFlight + 1)} of ${total}`
    : attention
      ? `${attention} upload${attention === 1 ? '' : 's'} need${attention === 1 ? 's' : ''} attention`
      : `Uploaded ${done} file${done === 1 ? '' : 's'}`

  return (
    <AnimatePresence>
      {total > 0 && (
        <motion.section
          aria-label="Uploads"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className={`fixed inset-x-3 z-[47] overflow-hidden rounded-[18px] border border-white/10 bg-[#141119]/95 shadow-[0_18px_44px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-[bottom] md:inset-x-auto md:right-[max(16px,calc(var(--gx)-24px))] md:w-[340px] ${
            raised ? 'bottom-[calc(env(safe-area-inset-bottom)+76px)] md:bottom-24' : 'bottom-[calc(var(--navpad)+10px)] md:bottom-5'
          }`}
        >
          <div className="flex items-center gap-1 border-b border-white/[0.07] py-2 pl-4 pr-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold text-ink" aria-live="polite">{title}</p>
              {inFlight > 0 && bytes[1] > 0 && (
                <p className="text-[11.5px] tabular-nums text-white/45">{formatBytes(bytes[0])} of {formatBytes(bytes[1])}</p>
              )}
            </div>
            {inFlight > 0 && (
              <button type="button" onClick={onCancelAll} className={`${PILL} text-white/70 hover:bg-white/10 hover:text-white`}>Cancel all</button>
            )}
            <button
              type="button"
              onClick={() => setCollapsed(c => !c)}
              aria-label={collapsed ? 'Show uploads' : 'Hide uploads'}
              aria-expanded={!collapsed}
              className={ICON_BTN}
            >
              <ChevronDownIcon className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onDismiss}
              disabled={inFlight > 0}
              aria-label="Close uploads"
              title={inFlight > 0 ? 'Uploads are still running' : undefined}
              className={ICON_BTN}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          {!collapsed && (
            <ul className="max-h-[min(46vh,340px)] overflow-y-auto py-1">
              {entries.map(e => (
                <UploadRow key={e.id} e={e} onRetry={onRetry} onKeepBoth={onKeepBoth} onSkip={onSkip} onCancel={onCancel} />
              ))}
            </ul>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  )
}

function UploadRow({ e, onRetry, onKeepBoth, onSkip, onCancel }: {
  e: UploadEntry
  onRetry: (id: string) => void
  onKeepBoth: (id: string) => void
  onSkip: (id: string) => void
  onCancel: (id: string) => void
}) {
  const pct = e.total ? Math.round((e.loaded / e.total) * 100) : e.state === 'done' ? 100 : 0
  const where = e.dir ? pathLabel(e.dir).split(' › ').pop() : 'Documents'
  return (
    <li className="flex items-start gap-3 px-4 py-2">
      <FileGlyph kind={fileKind({ isDir: false, name: e.name })} className="mt-0.5 h-[26px] w-[21px] shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[13px] font-semibold text-ink" title={e.name}>{e.name}</span>
        {e.state === 'queued' && <span className="text-[11.5px] text-white/45">{e.error ?? `Waiting… · to ${where}`}</span>}
        {e.state === 'uploading' && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.12]" role="progressbar" aria-label={`Uploading ${e.name}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
            </div>
            <span className="w-9 text-right text-[11px] tabular-nums text-white/50">{pct}%</span>
          </div>
        )}
        {e.state === 'done' && (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--positive,#7fd8a8)]">
            <CheckIcon className="h-3.5 w-3.5" /> Added to {where}
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
