'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { formatSize, type ApiEntry, type ApiFileEntry, type ApiDirEntry } from '@/lib/fileTypes'
import { Sheet } from '@/app/_components/HueControls'
import { CheckIcon, TrashIcon, UploadIcon, WarnIcon, XIcon } from './icons'
import { errorMessage, keepBothName, listEntries } from './api'

const BTN_GHOST = 'px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors'
const BTN_PRIMARY = 'px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-700 text-zinc-100 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
const BTN_DANGER = 'px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-500 transition-colors'

// ─── New Folder Modal ─────────────────────────────────────────────────────────

export function NewFolderModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function submit() {
    const trimmed = name.trim()
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <Sheet onClose={onClose}>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">New Folder</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors">
            <XIcon size={16} />
          </button>
        </div>

        <input
          ref={inputRef}
          type="text"
          placeholder="Folder name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-zinc-500 transition-colors"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-700 text-zinc-100 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </Sheet>
  )
}


function formatUploadSpeed(bps: number): string {
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(1)} GB/s`
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} MB/s`
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} KB/s`
  return `${Math.round(bps)} B/s`
}

function formatUploadEta(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.ceil(seconds % 60)
  if (m < 60) return `${m}m ${s}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

type UploadPhase = 'select' | 'checking' | 'conflict' | 'uploading' | 'done'

/** A file queued for upload and the name it will be saved as. */
type UploadItem = { file: File; name: string }

class UploadAborted extends Error {}

/** 409 from the upload route: these names already existed (the others were saved). */
class UploadConflict extends Error {
  constructor(readonly names: string[], readonly saved: number) {
    super(names.length === 1 ? `"${names[0]}" already exists` : `${names.length} files already exist`)
  }
}

function FileListPreview({ items }: { items: UploadItem[] }) {
  return (
    <div className="space-y-1 max-h-40 overflow-y-auto">
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-zinc-800/60">
          <span className="text-xs text-zinc-300 truncate">{it.name}</span>
          <span className="text-xs text-zinc-600 shrink-0">{formatSize(it.file.size)}</span>
        </div>
      ))}
    </div>
  )
}

export function UploadModal({
  dir,
  onChanged,
  onClose,
}: {
  dir: string
  /** The folder's contents changed (upload finished, or was cancelled part-way). */
  onChanged: () => void
  onClose: () => void
}) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [dropActive, setDropActive] = useState(false)
  const [phase, setPhase] = useState<UploadPhase>('select')
  const [conflicts, setConflicts] = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const [uploadSpeed, setUploadSpeed] = useState(0)
  const [uploadEta, setUploadEta] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadStartRef = useRef<number>(0)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  useEffect(() => {
    if (phase !== 'done') return
    const t = setTimeout(() => { onChanged(); onClose() }, 1400)
    return () => clearTimeout(t)
  }, [phase, onChanged, onClose])

  // Abort an in-flight upload if the modal goes away (or the page is left).
  useEffect(() => () => xhrRef.current?.abort(), [])
  useEffect(() => {
    if (phase !== 'uploading') return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase])

  function pick(list: FileList | null) {
    if (!list?.length) return
    setItems(Array.from(list, file => ({ file, name: file.name })))
    setUploadError(null)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDropActive(false)
    pick(e.dataTransfer.files)
  }

  /** Check the batch against the folder; upload, or stop at the conflict prompt. */
  /** Check the batch against the folder; upload, or stop at the conflict prompt. */
  async function check(batch: UploadItem[]) {
    setPhase('checking')
    setUploadError(null)
    try {
      const existing = new Set((await listEntries(dir)).map(e => e.name))
      const clashing = batch.filter(it => existing.has(it.name)).map(it => it.name)
      if (clashing.length) { setConflicts(clashing); setPhase('conflict'); return }
      await send(batch)
    } catch (e) {
      setUploadError(errorMessage(e))
      setPhase('select')
    }
  }

  /** Give the clashing files numbered names (free in the folder and the batch), then upload. */
  async function keepBoth() {
    const existing = await listEntries(dir)
      .then(es => new Set(es.map(e => e.name)))
      .catch(() => new Set<string>())
    const clashing = new Set(conflicts)
    const taken = new Set([...existing, ...items.map(it => it.name)])
    const renamed = items.map(it => {
      if (!clashing.has(it.name) && !existing.has(it.name)) return it
      const name = keepBothName(it.name, taken)
      taken.add(name)
      return { ...it, name }
    })
    setItems(renamed)
    await send(renamed)
  }

  async function send(batch: UploadItem[]) {
    setPhase('uploading')
    setProgress(0)
    setUploadSpeed(0)
    setUploadEta(null)
    const fd = new FormData()
    for (const it of batch) fd.append('files', it.file, it.name)
    try {
      const saved = await new Promise<number>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhrRef.current = xhr
        xhr.upload.onloadstart = () => { uploadStartRef.current = Date.now() }
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return
          setProgress(e.loaded / e.total)
          const elapsed = (Date.now() - uploadStartRef.current) / 1000
          if (elapsed > 0.5) {
            const speed = e.loaded / elapsed
            setUploadSpeed(speed)
            setUploadEta((e.total - e.loaded) / speed)
          }
        }
        xhr.onload = () => {
          let body: { error?: string; saved?: string[]; conflicts?: string[] } = {}
          try { body = JSON.parse(xhr.responseText) } catch { /* not JSON */ }
          if (xhr.status >= 200 && xhr.status < 300) return resolve(body.saved?.length ?? batch.length)
          if (xhr.status === 409 && body.conflicts?.length) {
            return reject(new UploadConflict(body.conflicts, body.saved?.length ?? 0))
          }
          reject(new Error(body.error || `Upload failed (${xhr.status})`))
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.onabort = () => reject(new UploadAborted())
        xhr.open('POST', `/api/files/upload?path=${encodeURIComponent(dir)}`)
        xhr.send(fd)
      })
      setSavedCount(n => n + saved)
      setPhase('done')
    } catch (e) {
      if (e instanceof UploadAborted) return
      if (e instanceof UploadConflict) {
        // Names taken since the pre-check: the rest were saved; ask about these.
        setSavedCount(n => n + e.saved)
        if (e.saved) onChanged()
        const pending = batch.filter(it => e.names.includes(it.name))
        if (pending.length) {
          setItems(pending)
          setConflicts(pending.map(it => it.name))
          setPhase('conflict')
          return
        }
      }
      setUploadError(errorMessage(e))
      setPhase('select')
    } finally {
      xhrRef.current = null
    }
  }

  /** Leave the clashing files out: upload the rest (if not already sent), else finish. */
  async function skip() {
    const clashing = new Set(conflicts)
    const rest = items.filter(it => !clashing.has(it.name))
    if (rest.length) { setItems(rest); await send(rest); return }
    onChanged()
    onClose()
  }

  function cancelUpload() {
    xhrRef.current?.abort()
    onChanged()
    onClose()
  }

  if (phase === 'uploading') {
    return (
      <Sheet onClose={cancelUpload}>
        <div className="p-6 space-y-5">
          <h2 className="text-sm font-semibold text-zinc-100">Uploading…</h2>

          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ ease: 'linear', duration: 0.1 }}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                {uploadSpeed > 0 ? formatUploadSpeed(uploadSpeed) : '—'}
              </p>
              <p className="text-xs text-zinc-500">
                {uploadEta !== null && uploadEta > 0
                  ? `${formatUploadEta(uploadEta)} · `
                  : ''}
                {Math.round(progress * 100)}%
              </p>
            </div>
          </div>

          <FileListPreview items={items} />

          <div className="flex justify-end">
            <button onClick={cancelUpload} className={BTN_GHOST}>Cancel upload</button>
          </div>
        </div>
      </Sheet>
    )
  }

  if (phase === 'done') {
    return (
      <Sheet onClose={onClose} label="Upload complete">
        <div className="p-6 flex flex-col items-center gap-3 py-10">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <CheckIcon className="text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-zinc-200">
            Uploaded {savedCount} file{savedCount !== 1 ? 's' : ''}
          </p>
        </div>
      </Sheet>
    )
  }

  if (phase === 'conflict') {
    return (
      <Sheet onClose={onClose}>
        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5"><WarnIcon className="text-amber-400" /></div>
            <div className="space-y-1 min-w-0">
              <h2 className="text-sm font-semibold text-zinc-100">
                {conflicts.length === 1 ? 'File already exists' : `${conflicts.length} files already exist`}
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {conflicts.length === 1
                  ? <><span className="text-zinc-200 font-medium break-all">{conflicts[0]}</span> is already in this folder.</>
                  : 'These names are already in this folder:'}
                {' '}Keep both to upload with a numbered name.
              </p>
            </div>
          </div>
          {conflicts.length > 1 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {conflicts.map(n => (
                <p key={n} className="px-3 py-1.5 rounded-lg bg-zinc-800/60 text-xs text-zinc-300 truncate">{n}</p>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={skip} className={BTN_GHOST}>Skip</button>
            <button onClick={keepBoth} className={BTN_PRIMARY}>Keep both</button>
          </div>
        </div>
      </Sheet>
    )
  }

  const checking = phase === 'checking'

  return (
    <Sheet onClose={onClose}>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Upload Files</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors">
            <XIcon size={16} />
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDropActive(true) }}
          onDragLeave={() => setDropActive(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl px-6 py-8 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
            dropActive
              ? 'border-zinc-500 bg-zinc-800/60'
              : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/30'
          }`}
        >
          <UploadIcon size={22} />
          <p className="text-sm text-zinc-400">
            Drop files here or <span className="text-zinc-200 underline underline-offset-2">browse</span>
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => pick(e.target.files)}
          />
        </div>

        {/* Selected file list */}
        {items.length > 0 && <FileListPreview items={items} />}

        {uploadError && (
          <p className="text-xs text-red-400">{uploadError}</p>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={BTN_GHOST}>Cancel</button>
          <button
            onClick={() => check(items)}
            disabled={!items.length || checking}
            className={BTN_PRIMARY}
          >
            {checking
              ? 'Checking…'
              : `Upload${items.length > 0 ? ` ${items.length} file${items.length !== 1 ? 's' : ''}` : ''}`}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

// ─── Delete File Modal ────────────────────────────────────────────────────────

export function DeleteFileModal({
  file,
  onConfirm,
  onClose,
}: {
  file: ApiFileEntry
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5 p-1.5 rounded-full bg-red-500/10">
            <TrashIcon size={16} className="text-red-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-zinc-100">Delete file?</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              <span className="text-zinc-200 font-medium">{file.name}</span>
              {' '}({formatSize(file.size)}) will be permanently deleted.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={BTN_GHOST}>Cancel</button>
          <button onClick={onConfirm} className={BTN_DANGER}>Delete</button>
        </div>
      </div>
    </Sheet>
  )
}

// ─── Delete Folder Modal ──────────────────────────────────────────────────────

export function DeleteFolderModal({
  folder,
  onConfirm,
  onClose,
}: {
  folder: ApiDirEntry
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5"><WarnIcon /></div>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-zinc-100">Delete folder?</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              <span className="text-zinc-200 font-medium">{folder.name}</span>
              {folder.childCount > 0
                ? <> contains {folder.childCount} item{folder.childCount !== 1 ? 's' : ''}.</>
                : ' contains hidden files.'}
              {' '}All contents will be permanently deleted and cannot be recovered.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={BTN_GHOST}>Cancel</button>
          <button onClick={onConfirm} className={BTN_DANGER}>Delete Everything</button>
        </div>
      </div>
    </Sheet>
  )
}

// ─── Name Conflict Modal (rename / move) ──────────────────────────────────────

export type Conflict = {
  /** The name that is already taken at the destination. */
  name: string
  /** Where it is taken, e.g. `this folder` or `“Photos”`. */
  destination: string
  /** The numbered name "Keep both" will use. */
  suggestion: string
  keepBoth: () => void
}

export function ConflictModal({ conflict, onClose }: { conflict: Conflict; onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <div className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5"><WarnIcon className="text-amber-400" /></div>
          <div className="space-y-1 min-w-0">
            <h2 className="text-sm font-semibold text-zinc-100">Name already in use</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              <span className="text-zinc-200 font-medium break-all">{conflict.name}</span> already exists
              in {conflict.destination}. Keep both to save it as{' '}
              <span className="text-zinc-200 font-medium break-all">{conflict.suggestion}</span>.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={BTN_GHOST}>Cancel</button>
          <button onClick={() => { onClose(); conflict.keepBoth() }} className={BTN_PRIMARY}>Keep both</button>
        </div>
      </div>
    </Sheet>
  )
}

// ─── Rename Modal ─────────────────────────────────────────────────────────────

export function RenameModal({
  entry,
  onConfirm,
  onClose,
}: {
  entry: ApiEntry
  onConfirm: (newName: string) => void
  onClose: () => void
}) {
  const ext = entry.kind === 'file' && entry.ext ? `.${entry.ext}` : ''
  const baseName = ext ? entry.name.slice(0, -ext.length) : entry.name
  const [name, setName] = useState(baseName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function submit() {
    const trimmed = name.trim()
    if (trimmed && trimmed !== baseName) onConfirm(trimmed + ext)
    else onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Rename</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors">
            <XIcon size={16} />
          </button>
        </div>

        <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-lg focus-within:border-zinc-500 transition-colors overflow-hidden">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); else if (e.key === 'Escape') onClose() }}
            className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm text-zinc-100 outline-none"
          />
          {name && (
            <button
              type="button"
              onClick={() => { setName(''); inputRef.current?.focus() }}
              aria-label="Clear name"
              className="p-1.5 mr-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
              tabIndex={-1}
            >
              <XIcon size={14} />
            </button>
          )}
          {ext && (
            <span className="px-3 py-2 text-sm text-zinc-500 border-l border-zinc-700 shrink-0 select-none">
              {ext}
            </span>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || name.trim() === baseName}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-700 text-zinc-100 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Rename
          </button>
        </div>
      </div>
    </Sheet>
  )
}
