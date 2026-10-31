'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { UploadResult } from '@/lib/photos/types'
import { formatBytes, isSupportedName } from './api'
import { CheckboxIcon, CloseIcon, UploadIcon } from './icons'

const BATCH_FILES = 10

export type UploadFileStatus = 'queued' | 'uploading' | 'processing' | 'created' | 'duplicate' | 'unsupported' | 'failed' | 'cancelled'

export type UploadEntry = {
  key: string
  name: string
  size: number
  status: UploadFileStatus
  /** 0–1 while uploading. */
  progress: number
  error?: string
}

type SetEntries = React.Dispatch<React.SetStateAction<UploadEntry[]>>

/** POST one batch; resolves with how many files the server added. Never rejects. */
function sendBatch(
  batch: { file: File; key: string }[],
  setEntries: SetEntries,
  xhrRef: React.RefObject<XMLHttpRequest | null>,
): Promise<number> {
  const patch = (keys: Set<string>, fn: (e: UploadEntry) => UploadEntry) =>
    setEntries(list => list.map(e => (keys.has(e.key) ? fn(e) : e)))
  return new Promise(resolve => {
    const keys = new Set(batch.map(b => b.key))
    const form = new FormData()
    for (const b of batch) form.append('files', b.file, b.file.name)
    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr
    const sizes = batch.map(b => b.file.size)
    const offsets = sizes.map((_, i) => sizes.slice(0, i).reduce((a, n) => a + n, 0))
    const totalFiles = sizes.reduce((a, n) => a + n, 0) || 1

    patch(keys, e => ({ ...e, status: 'uploading', progress: 0 }))
    xhr.upload.onprogress = ev => {
      // Multipart overhead is small; scale loaded bytes onto the files' own sizes.
      const loaded = ev.lengthComputable ? (ev.loaded / ev.total) * totalFiles : 0
      setEntries(list => list.map(e => {
        const i = batch.findIndex(b => b.key === e.key)
        if (i < 0) return e
        const p = sizes[i] ? Math.min(1, Math.max(0, (loaded - offsets[i]) / sizes[i])) : 1
        return { ...e, progress: p, status: p >= 1 ? 'processing' : 'uploading' }
      }))
    }
    xhr.upload.onload = () => patch(keys, e => ({ ...e, progress: 1, status: 'processing' }))
    xhr.onload = () => {
      let results: UploadResult[] = []
      let error = `Upload failed (${xhr.status})`
      try {
        const data = JSON.parse(xhr.responseText) as { results?: UploadResult[]; error?: string }
        if (Array.isArray(data.results)) results = data.results
        if (data.error) error = data.error
      } catch { /* not JSON */ }
      if (xhr.status === 503) error = 'Library offline'
      setEntries(list => list.map(e => {
        const i = batch.findIndex(b => b.key === e.key)
        if (i < 0) return e
        const r = xhr.status >= 200 && xhr.status < 300 ? results[i] : undefined
        if (!r) return { ...e, status: 'failed', error: xhr.status >= 300 ? error : 'No result from server' }
        if (r.status === 'created') return { ...e, status: 'created', progress: 1 }
        if (r.status === 'duplicate') return { ...e, status: 'duplicate', progress: 1 }
        if (r.error === 'Unsupported file type') return { ...e, status: 'unsupported', error: r.error }
        return { ...e, status: 'failed', error: r.error ?? 'Failed' }
      }))
      const ok = xhr.status >= 200 && xhr.status < 300
      resolve(ok ? results.filter(r => r.status === 'created').length : 0)
    }
    xhr.onerror = () => { patch(keys, e => ({ ...e, status: 'failed', error: 'Network error' })); resolve(0) }
    xhr.onabort = () => { patch(keys, e => ({ ...e, status: 'cancelled' })); resolve(0) }
    xhr.open('POST', '/api/photos/upload')
    xhr.send(form)
  })
}

/**
 * Uploads in batches of ~10 files, one XHR per batch (for upload progress), sequentially.
 * Per-file progress is derived from the batch's byte progress; per-file results come from
 * the server's `{ results }` (in file order). `cancel()` aborts the in-flight batch and
 * marks the rest cancelled. Warns before unload while anything is in flight.
 */
export function useUploader(onFinished: (created: number) => void) {
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const [running, setRunning] = useState(false)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const cancelled = useRef(false)
  const finishedRef = useRef(onFinished)
  useEffect(() => { finishedRef.current = onFinished }, [onFinished])

  useEffect(() => {
    if (!running) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [running])

  const start = useCallback(async (fileList: FileList | File[]) => {
    const files = [...fileList]
    if (files.length === 0 || xhrRef.current) return
    const stamp = Date.now()
    const job = {
      files,
      entries: files.map((f, i): UploadEntry => ({
        key: `${stamp}-${i}`,
        name: f.name,
        size: f.size,
        progress: 0,
        status: isSupportedName(f.name) ? 'queued' : 'unsupported',
        error: isSupportedName(f.name) ? undefined : 'Not a photo or video',
      })),
    }
    setEntries(job.entries)
    setRunning(true)
    cancelled.current = false

    const todo = job.entries.map((e, i) => ({ file: job.files[i], key: e.key, ok: e.status === 'queued' })).filter(t => t.ok)
    let created = 0
    for (let i = 0; i < todo.length && !cancelled.current; i += BATCH_FILES) {
      created += await sendBatch(todo.slice(i, i + BATCH_FILES), setEntries, xhrRef)
    }
    xhrRef.current = null
    setRunning(false)
    setEntries(list => list.map(e => (e.status === 'queued' ? { ...e, status: 'cancelled' } : e)))
    finishedRef.current(created)
  }, [])

  const cancel = useCallback(() => {
    cancelled.current = true
    xhrRef.current?.abort()
  }, [])
  const dismiss = useCallback(() => { if (!xhrRef.current) setEntries([]) }, [])

  return { entries, running, start, cancel, dismiss }
}

const STATUS_TEXT: Record<UploadFileStatus, string> = {
  queued: 'Waiting',
  uploading: 'Uploading',
  processing: 'Processing',
  created: 'Added',
  duplicate: 'Already in library',
  unsupported: 'Unsupported',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

function statusColor(s: UploadFileStatus): string {
  if (s === 'created') return 'var(--positive)'
  if (s === 'failed') return '#ff8a8a'
  if (s === 'unsupported' || s === 'cancelled') return 'rgba(255,255,255,0.45)'
  if (s === 'duplicate') return 'var(--star)'
  return 'rgba(255,255,255,0.65)'
}

/** Floating progress sheet (bottom on phones, bottom-right card on desktop). */
export function UploadSheet({ entries, running, onCancel, onDismiss }: {
  entries: UploadEntry[]
  running: boolean
  onCancel: () => void
  onDismiss: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  if (entries.length === 0) return null
  const done = entries.filter(e => !['queued', 'uploading', 'processing'].includes(e.status)).length
  const created = entries.filter(e => e.status === 'created').length
  const dupes = entries.filter(e => e.status === 'duplicate').length
  const failed = entries.filter(e => e.status === 'failed' || e.status === 'unsupported').length
  const totalBytes = entries.reduce((a, e) => a + e.size, 0)
  const sentBytes = entries.reduce((a, e) => a + e.size * (e.status === 'queued' ? 0 : e.progress), 0)
  const overall = totalBytes ? sentBytes / totalBytes : 0

  return (
    <motion.section
      role="region"
      aria-label="Uploads"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed inset-x-2 bottom-[calc(var(--navpad)+8px)] z-[70] overflow-hidden rounded-[18px] border border-white/10 bg-[#141119]/95 shadow-[0_18px_44px_rgba(0,0,0,0.55)] backdrop-blur-xl md:inset-x-auto md:bottom-6 md:right-6 md:w-[380px]"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-on-accent" style={{ background: 'var(--accent)' }}>
          <UploadIcon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="truncate text-[14px] font-bold text-ink">
            {running ? `Uploading ${done} of ${entries.length}` : `Upload finished`}
          </p>
          <p className="truncate text-[12px] text-white/55">
            {running
              ? `${formatBytes(sentBytes)} of ${formatBytes(totalBytes)}`
              : [created && `${created} added`, dupes && `${dupes} already there`, failed && `${failed} not uploaded`].filter(Boolean).join(' · ') || 'Nothing uploaded'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
          className="rounded-[10px] px-2 py-1 text-[12.5px] font-semibold text-white/70 hover:bg-white/10"
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
        {running ? (
          <button type="button" onClick={onCancel} className="rounded-[10px] bg-white/[0.08] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-white/15">
            Cancel
          </button>
        ) : (
          <button type="button" onClick={onDismiss} aria-label="Dismiss uploads" className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10">
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {running && (
        <div className="mx-4 mb-2 h-1 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Overall upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overall * 100)}>
          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${overall * 100}%`, background: 'var(--accent)' }} />
        </div>
      )}
      {!collapsed && (
        <ul className="max-h-[38vh] overflow-y-auto border-t border-white/[0.07] px-4 py-1 md:max-h-[320px]">
          {entries.map(e => (
            <li key={e.key} className="py-2">
              <div className="flex items-center gap-2">
                {e.status === 'created' && <CheckboxIcon checked className="h-4 w-4 shrink-0" style={{ color: 'var(--positive)' }} />}
                <span className="min-w-0 flex-1 truncate text-[13px] text-white/85" title={e.name}>{e.name}</span>
                <span className="shrink-0 text-[11.5px] font-semibold" style={{ color: statusColor(e.status) }} title={e.error}>
                  {e.status === 'uploading' ? `${Math.round(e.progress * 100)}%` : STATUS_TEXT[e.status]}
                </span>
              </div>
              {(e.status === 'uploading' || e.status === 'processing') && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full ${e.status === 'processing' ? 'reel-shimmer' : ''}`} style={{ width: `${e.progress * 100}%`, background: e.status === 'processing' ? undefined : 'var(--accent)' }} />
                </div>
              )}
              {e.error && (e.status === 'failed' || e.status === 'unsupported') && (
                <p className="mt-0.5 text-[11.5px] text-white/45">{e.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  )
}
