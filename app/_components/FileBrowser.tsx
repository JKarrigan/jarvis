'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  sortEntries, formatSize, formatDate, fileTypeInfo,
  type ApiEntry, type ApiFileEntry, type ApiDirEntry, type SortKey,
} from '@/lib/fileTypes'
import { useToast, Toast } from '@/app/_components/Toast'
import { Sheet } from '@/app/_components/HueControls'

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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function FileIcon({ entry, className }: { entry: ApiEntry; className?: string }) {
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

function UploadIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
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

function TrashIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
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

function XIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

// ─── New Folder Modal ─────────────────────────────────────────────────────────

function NewFolderModal({
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
          <button onClick={onClose} className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors">
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

// ─── Upload Modal ─────────────────────────────────────────────────────────────

type UploadPhase = 'select' | 'uploading' | 'done' | 'error'

function UploadModal({
  currentPath,
  onSuccess,
  onClose,
}: {
  currentPath: string[]
  onSuccess: () => void
  onClose: () => void
}) {
  const [files, setFiles] = useState<FileList | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [phase, setPhase] = useState<UploadPhase>('select')
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileList = files ? Array.from(files) : []

  useEffect(() => {
    if (phase !== 'done') return
    const t = setTimeout(() => { onSuccess(); onClose() }, 1400)
    return () => clearTimeout(t)
  }, [phase, onSuccess, onClose])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDropActive(false)
    if (e.dataTransfer.files.length) setFiles(e.dataTransfer.files)
  }

  async function upload() {
    if (!files?.length) return
    setPhase('uploading')
    setProgress(0)
    setUploadError(null)
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(e.loaded / e.total)
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`))
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.open('POST', `/api/files/upload?path=${encodeURIComponent(currentPath.join('/'))}`)
        xhr.send(fd)
      })
      setPhase('done')
    } catch (e) {
      setUploadError(String(e).replace(/^Error:\s*/, ''))
      setPhase('error')
    }
  }

  if (phase === 'uploading') {
    return (
      <Sheet onClose={() => {}}>
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
            <p className="text-xs text-zinc-600 text-right">{Math.round(progress * 100)}%</p>
          </div>

          <div className="space-y-1 max-h-40 overflow-y-auto">
            {fileList.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-zinc-800/60">
                <span className="text-xs text-zinc-300 truncate">{f.name}</span>
                <span className="text-xs text-zinc-600 shrink-0">{formatSize(f.size)}</span>
              </div>
            ))}
          </div>
        </div>
      </Sheet>
    )
  }

  if (phase === 'done') {
    return (
      <Sheet onClose={onClose}>
        <div className="p-6 flex flex-col items-center gap-3 py-10">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <CheckIcon className="text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-zinc-200">
            Uploaded {fileList.length} file{fileList.length !== 1 ? 's' : ''}
          </p>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={onClose}>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Upload Files</h2>
          <button onClick={onClose} className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors">
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
            onChange={e => e.target.files?.length && setFiles(e.target.files)}
          />
        </div>

        {/* Selected file list */}
        {fileList.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {fileList.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-zinc-800/60">
                <span className="text-xs text-zinc-300 truncate">{f.name}</span>
                <span className="text-xs text-zinc-600 shrink-0">{formatSize(f.size)}</span>
              </div>
            ))}
          </div>
        )}

        {uploadError && (
          <p className="text-xs text-red-400">{uploadError}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={upload}
            disabled={!fileList.length}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-700 text-zinc-100 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Upload{fileList.length > 0 ? ` ${fileList.length} file${fileList.length !== 1 ? 's' : ''}` : ''}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

// ─── Delete File Modal ────────────────────────────────────────────────────────

function DeleteFileModal({
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
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </Sheet>
  )
}

// ─── Delete Folder Modal ──────────────────────────────────────────────────────

function DeleteFolderModal({
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
              <span className="text-zinc-200 font-medium">{folder.name}</span> contains{' '}
              {folder.childCount} item{folder.childCount !== 1 ? 's' : ''}. All contents will be
              permanently deleted and cannot be recovered.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
          >
            Delete Everything
          </button>
        </div>
      </div>
    </Sheet>
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

function StorageBar({ disk }: { disk: { usedBytes: number; totalBytes: number } | null }) {
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

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({
  entry,
  filePath,
  onClose,
}: {
  entry: ApiFileEntry
  filePath: string
  onClose: () => void
}) {
  const [textContent, setTextContent] = useState<string | null>(null)
  const src = `/api/files/content?path=${encodeURIComponent(filePath)}`
  const { iconKind } = fileTypeInfo(entry.ext)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (iconKind !== 'text') return
    fetch(src).then(r => r.text()).then(setTextContent).catch(() => setTextContent('Failed to load file.'))
  }, [src, iconKind])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onClick={onClose}
      />
      <motion.div
        className="relative z-10 max-w-5xl max-h-[90vh] w-full mx-4 flex flex-col"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18, ease: [0.32, 0, 0.67, 0] } }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-zinc-300 truncate">{entry.name}</p>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors shrink-0"
          >
            <XIcon />
          </button>
        </div>

        {iconKind === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={entry.name}
            className="max-h-[80vh] max-w-full mx-auto rounded-lg object-contain"
          />
        )}

        {iconKind === 'video' && (
          <video
            src={src}
            controls
            autoPlay
            className="max-h-[80vh] max-w-full mx-auto rounded-lg"
          />
        )}

        {iconKind === 'text' && (
          <pre className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs p-4 rounded-lg overflow-auto max-h-[80vh] whitespace-pre-wrap break-words">
            {textContent ?? 'Loading…'}
          </pre>
        )}
      </motion.div>
    </div>
  )
}

// ─── List Row ─────────────────────────────────────────────────────────────────

function ListRow({
  entry,
  selected,
  isDragOver,
  isDragging,
  onActivate,
  onSelect,
  onDownload,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDrop,
}: {
  entry: ApiEntry
  selected: boolean
  isDragOver: boolean
  isDragging: boolean
  onActivate: () => void
  onSelect: () => void
  onDownload: () => void
  onDelete: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragEnter: () => void
  onDragLeave: () => void
  onDrop: () => void
}) {
  const isDir = entry.kind === 'dir'
  const info = isDir ? null : fileTypeInfo((entry as ApiFileEntry).ext)

  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart() }}
      onDragEnd={onDragEnd}
      onDragEnter={isDir ? e => { e.preventDefault(); onDragEnter() } : undefined}
      onDragLeave={isDir ? e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeave() } : undefined}
      onDragOver={isDir ? e => e.preventDefault() : undefined}
      onDrop={isDir ? e => { e.preventDefault(); onDrop() } : undefined}
      onClick={isDir ? onActivate : onSelect}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
        isDragOver
          ? 'ring-1 ring-inset ring-zinc-500 bg-zinc-800/60'
          : isDragging
            ? 'opacity-40'
            : selected
              ? 'bg-zinc-800 text-zinc-100'
              : 'hover:bg-zinc-900 text-zinc-300'
      }`}
    >
      <FileIcon entry={entry} className="w-5 h-5 shrink-0" />

      <span className={`flex-1 text-sm font-medium truncate min-w-0 ${selected && !isDragOver ? 'text-zinc-100' : 'text-zinc-200'}`}>
        {entry.name}
      </span>

      <span className="hidden sm:block w-28 shrink-0 text-xs text-zinc-600 truncate">
        {isDir ? 'Folder' : info?.label}
      </span>

      <span className="hidden md:block w-20 shrink-0 text-xs font-mono text-zinc-600 text-right">
        {isDir ? '—' : formatSize((entry as ApiFileEntry).size)}
      </span>

      <span className="hidden lg:block w-28 shrink-0 text-xs text-zinc-600 text-right">
        {formatDate(entry.modified)}
      </span>

      <div className={`flex items-center gap-0.5 shrink-0 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {!isDir && (
          <button
            onClick={e => { e.stopPropagation(); onDownload() }}
            title="Download"
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
          >
            <DownloadIcon />
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Delete"
          className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition-colors"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}

// ─── Grid Cell ────────────────────────────────────────────────────────────────

function GridCell({
  entry,
  selected,
  isDragOver,
  isDragging,
  onActivate,
  onSelect,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDrop,
}: {
  entry: ApiEntry
  selected: boolean
  isDragOver: boolean
  isDragging: boolean
  onActivate: () => void
  onSelect: () => void
  onDelete: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragEnter: () => void
  onDragLeave: () => void
  onDrop: () => void
}) {
  const isDir = entry.kind === 'dir'
  const info = isDir ? null : fileTypeInfo((entry as ApiFileEntry).ext)

  return (
    <div
      className={`relative group transition-opacity ${isDragging ? 'opacity-40' : ''}`}
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart() }}
      onDragEnd={onDragEnd}
      onDragEnter={isDir ? e => { e.preventDefault(); onDragEnter() } : undefined}
      onDragLeave={isDir ? e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeave() } : undefined}
      onDragOver={isDir ? e => e.preventDefault() : undefined}
      onDrop={isDir ? e => { e.preventDefault(); onDrop() } : undefined}
    >
      <button
        onClick={isDir ? onActivate : onSelect}
        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors text-left w-full ${
          isDragOver
            ? 'border-zinc-400 bg-zinc-800'
            : selected
              ? 'border-zinc-500 bg-zinc-800'
              : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900'
        }`}
      >
        <FileIcon entry={entry} className="w-9 h-9" />
        <div className="w-full space-y-0.5">
          <p className="text-xs font-medium text-zinc-100 truncate text-center">{entry.name}</p>
          <p className="text-xs text-zinc-600 text-center">
            {isDir ? 'Folder' : `${info?.label} · ${formatSize((entry as ApiFileEntry).size)}`}
          </p>
        </div>
      </button>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        title="Delete"
        className="absolute top-2 right-2 p-1 rounded-md text-zinc-600 hover:text-red-400 hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-all"
      >
        <TrashIcon size={12} />
      </button>
    </div>
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
  const [entries, setEntries] = useState<ApiEntry[]>([])
  const [diskInfo, setDiskInfo] = useState<{ usedBytes: number; totalBytes: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewEntry, setPreviewEntry] = useState<{ entry: ApiFileEntry; filePath: string } | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteFileTarget, setDeleteFileTarget] = useState<ApiFileEntry | null>(null)
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<ApiDirEntry | null>(null)
  const [dragEntry, setDragEntry] = useState<ApiEntry | null>(null)
  const [dragOverName, setDragOverName] = useState<string | null>(null)
  const { toast, showToast } = useToast()

  const refresh = useCallback(async (path: string[]) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/files/list?path=${encodeURIComponent(path.join('/'))}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? res.statusText)
      setEntries(data.entries)
      setDiskInfo(data.disk)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh(currentPath)
  }, [currentPath, refresh])

  const sorted = sortEntries(entries, sortKey)

  function navigateInto(name: string) {
    setCurrentPath(p => [...p, name])
    setSelected(null)
  }

  function navigateTo(idx: number) {
    setCurrentPath(p => idx < 0 ? [] : p.slice(0, idx + 1))
    setSelected(null)
  }

  function handleSelect(entry: ApiFileEntry) {
    const { iconKind } = fileTypeInfo(entry.ext)
    if (['image', 'video', 'text'].includes(iconKind)) {
      setPreviewEntry({ entry, filePath: [...currentPath, entry.name].join('/') })
    } else {
      setSelected(s => s === entry.name ? null : entry.name)
    }
  }

  function handleDownload(entry: ApiFileEntry) {
    const filePath = [...currentPath, entry.name].join('/')
    const url = `/api/files/content?path=${encodeURIComponent(filePath)}&download=true`
    const a = document.createElement('a')
    a.href = url
    a.download = entry.name
    a.click()
  }

  async function deleteEntry(entry: ApiEntry) {
    const entryPath = [...currentPath, entry.name].join('/')
    try {
      const res = await fetch(`/api/files/delete?path=${encodeURIComponent(entryPath)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      showToast('success', `Deleted "${entry.name}"`)
      setSelected(null)
      refresh(currentPath)
    } catch (e) {
      showToast('error', String(e))
    }
  }

  function handleDeleteAny(entry: ApiEntry) {
    if (entry.kind === 'dir') {
      if (entry.childCount === 0) deleteEntry(entry)
      else setDeleteFolderTarget(entry)
    } else {
      setDeleteFileTarget(entry)
    }
  }

  async function handleMove(intoName: string) {
    if (!dragEntry || dragEntry.name === intoName) return
    const fromPath = [...currentPath, dragEntry.name].join('/')
    const toDirPath = [...currentPath, intoName].join('/')
    const dragged = dragEntry
    setDragEntry(null)
    setDragOverName(null)
    try {
      const res = await fetch(
        `/api/files/move?from=${encodeURIComponent(fromPath)}&to=${encodeURIComponent(toDirPath)}`,
        { method: 'POST' }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? res.statusText)
      showToast('success', `Moved "${dragged.name}" into "${intoName}"`)
      refresh(currentPath)
    } catch (e) {
      showToast('error', String(e))
    }
  }

  async function handleNewFolder(name: string) {
    setNewFolderOpen(false)
    const newPath = [...currentPath, name].join('/')
    try {
      const res = await fetch(`/api/files/mkdir?path=${encodeURIComponent(newPath)}`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      showToast('success', `Created "${name}"`)
      refresh(currentPath)
    } catch (e) {
      showToast('error', String(e))
    }
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
          <div className="flex items-center justify-between gap-4">
            <Breadcrumb path={currentPath} onNavigate={navigateTo} />
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setUploadOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <UploadIcon />
                Upload
              </button>
              <button
                onClick={() => setNewFolderOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <NewFolderIcon />
                New Folder
              </button>
            </div>
          </div>

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
        <StorageBar disk={diskInfo} />

        {/* ── File Listing ── */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-zinc-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-20 gap-2">
            <p className="text-sm text-red-400">Failed to load files</p>
            <p className="text-xs text-zinc-600">{error}</p>
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState />
        ) : viewMode === 'list' ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800/60">
              <span className="w-5 shrink-0" />
              <span className="flex-1 text-xs font-semibold uppercase tracking-widest text-zinc-600">Name</span>
              <span className="hidden sm:block w-28 shrink-0 text-xs font-semibold uppercase tracking-widest text-zinc-600">Type</span>
              <span className="hidden md:block w-20 shrink-0 text-xs font-semibold uppercase tracking-widest text-zinc-600 text-right">Size</span>
              <span className="hidden lg:block w-28 shrink-0 text-xs font-semibold uppercase tracking-widest text-zinc-600 text-right">Modified</span>
              <span className="w-16 shrink-0" />
            </div>
            <div className="divide-y divide-zinc-800/40">
              {sorted.map(entry => (
                <ListRow
                  key={entry.name}
                  entry={entry}
                  selected={selected === entry.name}
                  isDragOver={dragOverName === entry.name && entry.kind === 'dir'}
                  isDragging={dragEntry?.name === entry.name}
                  onActivate={() => entry.kind === 'dir' && navigateInto(entry.name)}
                  onSelect={() => entry.kind === 'file' && handleSelect(entry)}
                  onDownload={() => entry.kind === 'file' && handleDownload(entry)}
                  onDelete={() => handleDeleteAny(entry)}
                  onDragStart={() => setDragEntry(entry)}
                  onDragEnd={() => { setDragEntry(null); setDragOverName(null) }}
                  onDragEnter={() => entry.kind === 'dir' && setDragOverName(entry.name)}
                  onDragLeave={() => setDragOverName(null)}
                  onDrop={() => entry.kind === 'dir' && handleMove(entry.name)}
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
                isDragOver={dragOverName === entry.name && entry.kind === 'dir'}
                isDragging={dragEntry?.name === entry.name}
                onActivate={() => entry.kind === 'dir' && navigateInto(entry.name)}
                onSelect={() => entry.kind === 'file' && handleSelect(entry)}
                onDelete={() => handleDeleteAny(entry)}
                onDragStart={() => setDragEntry(entry)}
                onDragEnd={() => { setDragEntry(null); setDragOverName(null) }}
                onDragEnter={() => entry.kind === 'dir' && setDragOverName(entry.name)}
                onDragLeave={() => setDragOverName(null)}
                onDrop={() => entry.kind === 'dir' && handleMove(entry.name)}
              />
            ))}
          </div>
        )}
      </main>

      <AnimatePresence>
        {newFolderOpen && (
          <NewFolderModal
            key="new-folder"
            onConfirm={handleNewFolder}
            onClose={() => setNewFolderOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {uploadOpen && (
          <UploadModal
            key="upload"
            currentPath={currentPath}
            onSuccess={() => refresh(currentPath)}
            onClose={() => setUploadOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteFileTarget && (
          <DeleteFileModal
            key="delete-file"
            file={deleteFileTarget}
            onConfirm={() => {
              const target = deleteFileTarget
              setDeleteFileTarget(null)
              deleteEntry(target)
            }}
            onClose={() => setDeleteFileTarget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteFolderTarget && (
          <DeleteFolderModal
            key="delete-folder"
            folder={deleteFolderTarget}
            onConfirm={() => {
              const target = deleteFolderTarget
              setDeleteFolderTarget(null)
              deleteEntry(target)
            }}
            onClose={() => setDeleteFolderTarget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewEntry && (
          <PreviewModal
            key="preview"
            entry={previewEntry.entry}
            filePath={previewEntry.filePath}
            onClose={() => setPreviewEntry(null)}
          />
        )}
      </AnimatePresence>

      <Toast toast={toast} />
    </div>
  )
}
