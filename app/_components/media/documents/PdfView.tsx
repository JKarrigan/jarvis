'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { openPdf, renderPage } from '../books/pdf'
import { errorText } from './api'

type Loaded = { url: string; doc: PDFDocumentProxy | null; pages: number; ratio: number; error: string | null }

/**
 * A simple scrolling PDF reader (pdf.js via the books loader, worker from /api/pdfjs):
 * every page is a placeholder at page 1's aspect ratio and is drawn only when it scrolls
 * near the viewport. Reports the page count and the page in view.
 */
export function PdfView({ url, onInfo, fallback }: {
  url: string
  onInfo?: (info: { page: number; pages: number }) => void
  /** Rendered when the PDF can't be opened (damaged, encrypted…). */
  fallback: (error: string) => React.ReactNode
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const infoRef = useRef(onInfo)
  useEffect(() => { infoRef.current = onInfo }, [onInfo])

  useEffect(() => {
    let closed = false
    let close: (() => void) | null = null
    openPdf(url)
      .then(async book => {
        if (closed) { book.close(); return }
        close = book.close
        const first = await book.doc.getPage(1)
        const vp = first.getViewport({ scale: 1 })
        if (!closed) setLoaded({ url, doc: book.doc, pages: book.doc.numPages, ratio: vp.height / vp.width, error: null })
      })
      .catch(e => { if (!closed) setLoaded({ url, doc: null, pages: 0, ratio: 1.414, error: errorText(e) }) })
    return () => { closed = true; close?.() }
  }, [url])

  const current = loaded?.url === url ? loaded : null
  const doc = current?.doc ?? null
  const pages = current?.pages ?? 0

  useEffect(() => {
    if (pages) infoRef.current?.({ page: 1, pages })
  }, [pages])

  // Draw pages as they near the viewport; track the page in view for the counter.
  useEffect(() => {
    const root = scroller.current
    if (!doc || !root) return
    const drawn = new Set<number>()
    const tasks: { cancel: () => void }[] = []
    const draw = async (canvas: HTMLCanvasElement) => {
      const n = Number(canvas.dataset.page)
      if (drawn.has(n)) return
      drawn.add(n)
      const width = canvas.parentElement?.clientWidth ?? 800
      try {
        const task = await renderPage(doc, n, canvas, width, 1e6, Math.min(2, window.devicePixelRatio || 1))
        tasks.push(task)
        await task.done
      } catch {
        drawn.delete(n)
      }
    }
    const near = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) void draw(e.target as HTMLCanvasElement)
    }, { root, rootMargin: '800px 0px' })
    const inView = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) infoRef.current?.({ page: Number((e.target as HTMLElement).dataset.page), pages: doc.numPages })
      }
    }, { root, threshold: 0.5 })
    root.querySelectorAll<HTMLCanvasElement>('canvas[data-page]').forEach(c => { near.observe(c); inView.observe(c) })
    return () => {
      near.disconnect()
      inView.disconnect()
      tasks.forEach(t => t.cancel())
    }
  }, [doc])

  if (current?.error) return <>{fallback(current.error)}</>
  if (!current) {
    return (
      <div className="grid h-full place-items-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" aria-label="Loading PDF" />
      </div>
    )
  }
  return (
    <div ref={scroller} className="h-full overflow-y-auto overscroll-contain px-2 py-4 md:px-6" tabIndex={0} aria-label={`PDF, ${pages} pages`}>
      <div className="mx-auto flex max-w-[920px] flex-col gap-4">
        {Array.from({ length: pages }, (_, i) => (
          <div key={i} className="w-full overflow-hidden rounded-[6px] bg-white shadow-[0_18px_44px_rgba(0,0,0,0.5)]" style={{ aspectRatio: `1 / ${current.ratio}` }}>
            <canvas data-page={i + 1} aria-label={`Page ${i + 1}`} className="block h-full w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
