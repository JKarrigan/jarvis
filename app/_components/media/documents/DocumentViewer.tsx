'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useDialog } from '../hooks'
import { useBodyScrollLock } from '../photos/hooks'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, DownloadIcon } from '../photos/icons'
import {
  baseName, contentUrl, downloadFile, errorText, formatBytes, formatModified, isAbort, parentOf, thumbUrl, type DocItem,
} from './api'
import { TEXT_PREVIEW_MAX, browserCanShowImage, fileKind, kindLabel } from './fileKinds'
import { CopyIcon, FileGlyph } from './icons'
import { PdfView } from './PdfView'

/** A stand-in for a deep-linked file that isn't in the current listing. */
function standIn(path: string): DocItem {
  return { path, name: baseName(path), isDir: false, size: 0, modified: 0, childCount: 0, parent: parentOf(path) }
}

/**
 * Full-screen file viewer (`?view=<path>`): PDFs in a pdf.js reader, images (server
 * preview first, then the original), video and audio natively from `content` (Range),
 * text up to 256 KiB inline, and an icon card with Download and the NAS path for
 * everything else (Word, Excel…). ←/→ (Shift+←/→ in a PDF, whose plain arrows turn its
 * pages) step through the current folder's files only.
 */
export function DocumentViewer({ path, files, nasRoot, onGo, onClose }: {
  path: string
  /** The files of the list the viewer was opened from (folders excluded), in view order. */
  files: DocItem[]
  /** The share's name on the NAS ("documents"), for the "Open on NAS" path. */
  nasRoot: string
  onGo: (path: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useDialog(ref, onClose)
  useBodyScrollLock()
  const index = files.findIndex(f => f.path === path)
  const item = index >= 0 ? files[index] : standIn(path)
  const prev = index > 0 ? files[index - 1] : null
  const next = index >= 0 && index < files.length - 1 ? files[index + 1] : null
  const isPdf = fileKind(item) === 'pdf'
  const [pdfInfo, setPdfInfo] = useState<{ path: string; page: number; pages: number } | null>(null)
  const onPdfInfo = useCallback((i: { page: number; pages: number }) => setPdfInfo({ path, ...i }), [path])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      // Media elements and text fields keep their own arrow keys (seek, caret).
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'VIDEO' || t.tagName === 'AUDIO' || t.isContentEditable)) return
      if (document.querySelectorAll('[aria-modal="true"]').length > 1) return
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      // In a PDF, plain ←/→ turn its pages (PdfView); Shift+←/→ change file everywhere.
      if (isPdf && !e.shiftKey) return
      if (e.key === 'ArrowRight' && next) { e.preventDefault(); onGo(next.path) }
      else if (e.key === 'ArrowLeft' && prev) { e.preventDefault(); onGo(prev.path) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, onGo, isPdf])

  const kind = fileKind(item)
  const position = index >= 0 ? `${index + 1} of ${files.length}` : ''
  const pdfLine = pdfInfo?.path === path ? `Page ${pdfInfo.page} of ${pdfInfo.pages}` : ''
  const sub = [position, kindLabel(item), item.size ? formatBytes(item.size) : '', pdfLine].filter(Boolean).join(' · ')
  const card = (note?: string) => <InfoCard item={item} nasRoot={nasRoot} note={note} />

  let body: React.ReactNode
  if (kind === 'pdf') body = <PdfView key={path} item={item} onInfo={onPdfInfo} fallback={err => card(`Couldn’t open this PDF (${err}).`)} />
  else if (kind === 'image') body = <ImageView key={path} item={item} fallback={card} />
  else if (kind === 'video') body = <MediaView key={path} kind="video" item={item} fallback={card} />
  else if (kind === 'audio') body = <MediaView key={path} kind="audio" item={item} fallback={card} />
  else if (kind === 'text' || kind === 'csv') body = <TextView key={path} item={item} fallback={card} />
  else body = card()

  const navBtn = 'grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/90 transition hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[80] flex flex-col bg-[#09070c]/[0.97] text-ink backdrop-blur-xl"
      style={{ fontFamily: 'var(--font-manrope), system-ui, sans-serif' }}
    >
      <header className="flex items-center gap-1 border-b border-white/[0.06] px-2 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] md:px-4">
        <button type="button" onClick={onClose} aria-label="Close viewer" className={navBtn} data-autofocus>
          <CloseIcon className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <h2 className="truncate text-[15px] font-bold" style={{ fontFamily: 'var(--font-schibsted), var(--font-manrope), sans-serif' }} title={item.name}>{item.name}</h2>
          <p className="truncate text-[11.5px] text-white/50" aria-live="polite">{sub}</p>
        </div>
        <button type="button" onClick={() => prev && onGo(prev.path)} disabled={!prev} aria-label="Previous file" title="Previous file (⇧←)" className={navBtn}>
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => next && onGo(next.path)} disabled={!next} aria-label="Next file" title="Next file (⇧→)" className={navBtn}>
          <ChevronRightIcon className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => downloadFile(item)} aria-label={`Download ${item.name}`} className={navBtn}>
          <DownloadIcon className="h-5 w-5" />
        </button>
      </header>
      <div className="relative min-h-0 flex-1">{body}</div>
    </motion.div>
  )
}

function ImageView({ item, fallback }: { item: DocItem; fallback: (note?: string) => React.ReactNode }) {
  const canOriginal = browserCanShowImage(item.name)
  // Preview (p, 1280 px) first; the original replaces it once loaded, if the browser can draw it.
  const [preview, setPreview] = useState<'loading' | 'ok' | 'error'>('loading')
  const [original, setOriginal] = useState<'loading' | 'ok' | 'error'>(canOriginal ? 'loading' : 'error')
  if (preview === 'error' && original === 'error') return <>{fallback('No preview for this image.')}</>
  const cls = 'object-contain p-2 md:p-6'
  return (
    <div className="absolute inset-0">
      {preview !== 'error' && original !== 'ok' && (
        <Image src={thumbUrl(item, 'p')} alt="" fill unoptimized sizes="100vw" className={cls}
          onLoad={() => setPreview('ok')} onError={() => setPreview('error')} />
      )}
      {canOriginal && original !== 'error' && (
        <Image src={contentUrl(item.path)} alt={item.name} fill unoptimized sizes="100vw"
          className={`${cls} transition-opacity duration-300 ${original === 'ok' ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setOriginal('ok')} onError={() => setOriginal('error')} />
      )}
      {preview === 'loading' && original === 'loading' && (
        <span className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-white/80" aria-label="Loading image" />
      )}
    </div>
  )
}

function MediaView({ item, kind, fallback }: { item: DocItem; kind: 'video' | 'audio'; fallback: (note?: string) => React.ReactNode }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <>{fallback(`This browser can’t play this ${kind} file. Download it to play it.`)}</>
  if (kind === 'audio') {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="flex w-full max-w-[460px] flex-col items-center gap-5">
          <FileGlyph kind="audio" className="h-[120px] w-[98px]" />
          <audio src={contentUrl(item.path)} controls autoPlay preload="metadata" onError={() => setFailed(true)} className="w-full" />
        </div>
      </div>
    )
  }
  return (
    <div className="grid h-full place-items-center bg-black p-0 md:p-4">
      <video src={contentUrl(item.path)} controls autoPlay playsInline preload="metadata" onError={() => setFailed(true)} className="max-h-full max-w-full" />
    </div>
  )
}

type TextState = { path: string; text: string | null; tooBig: boolean; error: string | null }

function TextView({ item, fallback }: { item: DocItem; fallback: (note?: string) => React.ReactNode }) {
  const [state, setState] = useState<TextState | null>(null)
  const tooBigUpFront = item.size > TEXT_PREVIEW_MAX
  useEffect(() => {
    if (tooBigUpFront) return
    const ctrl = new AbortController()
    fetch(contentUrl(item.path), { signal: ctrl.signal })
      .then(async res => {
        if (!res.ok) throw new Error(`Couldn’t load the file (${res.status})`)
        // Deep links have no size: check the header before reading the body.
        if (Number(res.headers.get('content-length') ?? 0) > TEXT_PREVIEW_MAX) {
          ctrl.abort()
          setState({ path: item.path, text: null, tooBig: true, error: null })
          return
        }
        setState({ path: item.path, text: await res.text(), tooBig: false, error: null })
      })
      .catch(e => { if (!isAbort(e)) setState({ path: item.path, text: null, tooBig: false, error: errorText(e) }) })
    return () => ctrl.abort()
  }, [item.path, tooBigUpFront])

  const cur = state?.path === item.path ? state : null
  if (tooBigUpFront || cur?.tooBig) return <>{fallback('Too large to preview here (over 256 KB).')}</>
  if (cur?.error) return <>{fallback(cur.error)}</>
  if (!cur) {
    return <div className="grid h-full place-items-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" aria-label="Loading" /></div>
  }
  return (
    <div className="h-full overflow-auto overscroll-contain px-3 py-4 md:px-8" tabIndex={0} aria-label={`Contents of ${item.name}`}>
      <pre className="mx-auto max-w-[980px] whitespace-pre-wrap break-words rounded-[14px] border border-white/[0.07] bg-white/[0.03] p-4 text-[13px] leading-relaxed text-white/85 md:p-6" style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
        {cur.text || ' '}
      </pre>
    </div>
  )
}

/** Big icon card for files the browser can't show (Word, Excel…): kind, size, Download, NAS path. */
function InfoCard({ item, nasRoot, note }: { item: DocItem; nasRoot: string; note?: string }) {
  const [copied, setCopied] = useState(false)
  const nasPath = `${nasRoot}/${item.path}`
  const copy = () => {
    void navigator.clipboard?.writeText(nasPath).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }, () => {})
  }
  return (
    <div className="grid h-full place-items-center overflow-y-auto p-6">
      <div className="flex w-full max-w-[440px] flex-col items-center rounded-[22px] border border-border bg-surface px-6 py-8 text-center">
        <FileGlyph kind={fileKind(item)} className="h-[128px] w-[104px]" />
        <p className="mt-5 max-w-full break-words text-[18px] font-bold text-ink">{item.name}</p>
        <p className="mt-1 text-[13px] text-white/50">
          {[kindLabel(item), item.size ? formatBytes(item.size) : '', item.modified ? `Modified ${formatModified(item.modified)}` : ''].filter(Boolean).join(' · ')}
        </p>
        {note && <p className="mt-3 text-[13px] text-white/60">{note}</p>}
        <button
          type="button"
          onClick={() => downloadFile(item)}
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-[12px] px-5 text-[14px] font-bold text-ink-on-accent shadow-[0_10px_30px_var(--glow)] transition hover:brightness-[1.06]"
          style={{ background: 'var(--accent)' }}
        >
          <DownloadIcon className="h-[18px] w-[18px]" /> Download
        </button>
        <div className="mt-6 w-full text-left">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">Open on NAS</p>
          <div className="mt-1.5 flex items-center gap-2 rounded-[10px] border border-white/[0.08] bg-black/25 py-1.5 pl-3 pr-1.5">
            <code className="min-w-0 flex-1 break-all text-[12.5px] text-white/75" style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{nasPath}</code>
            <button type="button" onClick={copy} aria-label="Copy NAS path" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white">
              <CopyIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-[11.5px] text-white/40" aria-live="polite">{copied ? 'Copied' : 'The same folder in Finder or File Explorer, on the NAS share.'}</p>
        </div>
      </div>
    </div>
  )
}
