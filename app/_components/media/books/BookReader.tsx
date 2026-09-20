'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import type { Ebook } from '../types'
import { Slider } from '../playerUi'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons'
import { openBook, renderPage, type OpenBook } from './pdf'

/**
 * Full-screen page-at-a-time PDF reader. Tap or click the edges (or use the arrow
 * keys / swipe) to turn pages; the page you're on is saved to the app's DB so the
 * book reopens there. `rtl` flips the turn direction for vertical-text books.
 */
export function BookReader({ book }: { book: Ebook }) {
  const router = useRouter()
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const openRef = useRef<OpenBook | null>(null)
  const [pages, setPages] = useState(book.pages ?? 0)
  const [page, setPage] = useState(() => (book.finished ? 1 : book.page ?? 1))
  const [rtl, setRtl] = useState(Boolean(book.rtl))
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const [painting, setPainting] = useState(true)
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Open the document once.
  useEffect(() => {
    let cancelled = false
    openBook(book.id)
      .then(open => {
        if (cancelled) return open.close()
        openRef.current = open
        setPages(open.doc.numPages)
        setPage(p => Math.min(Math.max(1, p), open.doc.numPages))
        setReady(true)
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => {
      cancelled = true
      openRef.current?.close()
      openRef.current = null
    }
  }, [book.id])

  // Track the stage size so the page always fits the screen.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setSize({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Paint the current page.
  useEffect(() => {
    const open = openRef.current
    const canvas = canvasRef.current
    if (!ready || !open || !canvas || size.w === 0 || size.h === 0) return
    let cancel: (() => void) | undefined
    let stale = false
    setPainting(true)
    renderPage(open.doc, page, canvas, size.w, size.h, Math.min(2, window.devicePixelRatio || 1))
      .then(task => {
        if (stale) return task.cancel()
        cancel = task.cancel
        return task.done.then(() => { if (!stale) setPainting(false) })
      })
      .catch(() => { if (!stale) setError(true) })
    return () => { stale = true; cancel?.() }
  }, [ready, page, size])

  // Remember the page (debounced; flushed on leave).
  const latest = useRef({ page, pages, rtl })
  useEffect(() => { latest.current = { page, pages, rtl } }, [page, pages, rtl])
  const save = useCallback((keepalive = false) => {
    const { page: p, pages: n, rtl: r } = latest.current
    if (n < 1) return
    void fetch(`/api/jellyfin/books/${book.id}/progress`, {
      method: 'PUT', keepalive,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: p, pages: n, rtl: r }),
    }).catch(() => { })
  }, [book.id])
  useEffect(() => {
    if (!ready) return
    const id = setTimeout(() => save(), 600)
    return () => clearTimeout(id)
  }, [ready, page, rtl, save])
  useEffect(() => () => save(true), [save])

  const go = useCallback((delta: number) => setPage(p => Math.min(Math.max(1, p + delta), Math.max(1, latest.current.pages))), [])
  const leave = useCallback(() => {
    save(true)
    router.push('/media/books')
    router.refresh()
  }, [router, save])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const forward = latest.current.rtl ? 'ArrowLeft' : 'ArrowRight'
      const back = latest.current.rtl ? 'ArrowRight' : 'ArrowLeft'
      if (e.key === forward || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(1) }
      else if (e.key === back || e.key === 'PageUp') { e.preventDefault(); go(-1) }
      else if (e.key === 'Home') go(-1e6)
      else if (e.key === 'End') go(1e6)
      else if (e.key === 'Escape') leave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, leave])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Swipe: a mostly-horizontal drag past 50px turns the page in the drag's direction.
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dx = e.clientX - s.x
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(e.clientY - s.y) * 1.5) return
    // Dragging the page toward the left reveals the next one (LTR); mirrored for RTL.
    go((dx < 0 ? 1 : -1) * (rtl ? -1 : 1))
  }

  const leftDelta = rtl ? 1 : -1
  const edge = 'absolute inset-y-0 z-10 flex w-[32%] items-center text-white/0 transition-colors hover:text-white/70 focus-visible:text-white/70 disabled:pointer-events-none'
  const fraction = pages > 1 ? (page - 1) / (pages - 1) : 0

  return (
    <motion.div
      role="dialog"
      aria-label={`Reading ${book.title}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 flex flex-col bg-[#0b0a0e]"
    >
      <div className="flex shrink-0 items-center gap-3 px-3 py-2.5 md:px-5">
        <button type="button" onClick={leave} className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 pl-3 pr-4 text-sm font-medium text-ink transition hover:bg-white/10">
          <ChevronLeftIcon className="h-4 w-4" /> Books
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[14.5px] font-bold text-ink">{book.title}</div>
          {book.author && <div className="truncate text-[12px] text-white/50">{book.author}</div>}
        </div>
        <button
          type="button"
          onClick={() => setRtl(r => !r)}
          aria-pressed={rtl}
          title="Page direction — switch for books with vertical text, which read right to left"
          className={`h-11 shrink-0 rounded-full border border-white/10 px-4 text-[12.5px] font-bold transition ${rtl ? 'bg-surface-2 text-accent-soft' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
        >
          {rtl ? '← Right to left' : 'Left to right →'}
        </button>
      </div>

      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="relative min-h-0 flex-1 touch-pan-y select-none overflow-hidden"
      >
        <div className="absolute inset-0 grid place-items-center">
          {error ? (
            <p className="px-6 text-center text-[15px] text-white/70">This book couldn’t be opened. Check that Jellyfin is reachable, then try again.</p>
          ) : (
            <canvas ref={canvasRef} className={`rounded-[3px] bg-white shadow-[0_30px_90px_rgba(0,0,0,0.6)] transition-opacity duration-200 ${ready && !painting ? 'opacity-100' : 'opacity-40'}`} />
          )}
        </div>
        <button type="button" aria-label={rtl ? 'Next page' : 'Previous page'} disabled={page + leftDelta < 1 || page + leftDelta > pages} onClick={() => go(leftDelta)} className={`${edge} left-0 justify-start pl-3`}>
          <ChevronLeftIcon className="h-9 w-9" />
        </button>
        <button type="button" aria-label={rtl ? 'Previous page' : 'Next page'} disabled={page - leftDelta < 1 || page - leftDelta > pages} onClick={() => go(-leftDelta)} className={`${edge} right-0 justify-end pr-3`}>
          <ChevronRightIcon className="h-9 w-9" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-4 px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-2.5">
        {/* The scrubber mirrors for right-to-left books so dragging matches the page order. */}
        <div className="min-w-0 flex-1" style={{ transform: rtl ? 'scaleX(-1)' : undefined }}>
          <Slider ariaLabel="Page" fraction={fraction} onChange={f => setPage(Math.round(f * Math.max(0, pages - 1)) + 1)} />
        </div>
        <div className="w-[92px] shrink-0 text-right text-[13px] font-bold tabular-nums text-white/80">
          {pages ? `${page} / ${pages}` : '…'}
        </div>
      </div>
    </motion.div>
  )
}
