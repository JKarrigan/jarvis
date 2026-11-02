'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdfViewer, openPdf, type PdfViewerLib } from '../books/pdf'
import { useEscape } from '../hooks'
import { CloseIcon, DownloadIcon } from '../photos/icons'
import { contentUrl, downloadFile, errorText, type DocItem } from './api'
import { CheckIcon } from './icons'
import {
  ChevronDownSmall, ChevronUpSmall, FindIcon, FitPageIcon, FitWidthIcon, MoreDotsIcon, PrintIcon, RotateIcon,
  SidebarIcon, ZoomInIcon, ZoomOutIcon,
} from './pdf/icons'
import {
  ZOOM_MENU, boundedFactor, browserStore, clampScale, defaultZoom, isZoomValue, loadPosition, parsePageInput,
  positionKey, savePosition, stepZoom, wheelFactor, zoomLabel, type ZoomValue,
} from './pdf/model'
import { PdfSidebar, type OutlineNode, type SidebarTab } from './pdf/PdfSidebar'
import { Popover, popItem } from './pdf/Popover'
import { acquireViewerCss } from './pdf/viewerCss'

type Viewer = InstanceType<PdfViewerLib['PDFViewer']>
type Bus = InstanceType<PdfViewerLib['EventBus']>
type ViewerOptions = ConstructorParameters<PdfViewerLib['PDFViewer']>[0] & { abortSignal?: AbortSignal }

type Loaded =
  | { url: string; doc: PDFDocumentProxy; lib: PdfViewerLib; annotationMode: number; ratio: number; outline: OutlineNode[]; error: null }
  | { url: string; doc: null; error: string }

type FindStatus = 'idle' | 'pending' | 'found' | 'notfound'
interface FindUi { open: boolean; query: string; current: number; total: number; status: FindStatus }
const FIND_CLOSED: FindUi = { open: false, query: '', current: 0, total: 0, status: 'idle' }

/** pdf.js FindState values (FOUND 0, NOT_FOUND 1, WRAPPED 2, PENDING 3). */
const FIND_NOT_FOUND = 1
const FIND_PENDING = 3

type RawOutline = { title: string; dest: string | unknown[] | null; url: string | null; items: RawOutline[] }
function toOutline(items: RawOutline[] | null, depth = 0): OutlineNode[] {
  if (!items || depth > 8) return []
  return items.map(i => ({ title: i.title, dest: i.dest, url: i.url, items: toOutline(i.items, depth + 1) }))
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && Boolean(el.closest('input, textarea, select, [contenteditable="true"], [role="menu"]'))

const PHONE_QUERY = '(max-width: 767px)'

/** Scoped overrides on top of pdf.js's pdf_viewer.css (loaded by acquireViewerCss). */
const READER_CSS = `
.reel-pdf .pdf-canvas{background:#3b3b40;color-scheme:light}
.reel-pdf .pdfViewer{padding:10px 0 28px}
.reel-pdf .pdfViewer .page .canvasWrapper{box-shadow:0 6px 22px rgba(0,0,0,.42)}
.reel-pdf .pdfViewer.removePageBorders .page{margin:0 auto 8px}
.reel-pdf .textLayer .highlight{--highlight-bg-color:rgb(255 200 40 / .38);--highlight-selected-bg-color:rgb(255 122 24 / .62)}
.reel-pdf .textLayer ::selection{background:rgb(60 130 255 / .32)}
`

/**
 * The Documents PDF reader: pdf.js's own viewer component (PDFViewer + EventBus +
 * PDFLinkService + PDFFindController, legacy build) over the range-capable
 * `/api/files/content` URL — continuous scroll, lazy DPR-sharp pages, a selectable text
 * layer, links and outline jumps, find, zoom (buttons, menu, Ctrl/Cmd+wheel, pinch),
 * page input, thumbnails, rotate, print and download. The last page, zoom and rotation
 * are remembered per document version (path + modified) in localStorage.
 *
 * Keys (when not typing): ←/→ and PgUp/PgDn page, Home/End jump to the first/last
 * page, ↑/↓ scroll, Cmd/Ctrl+F finds, Cmd/Ctrl +/−/0 zoom. Shift+←/→ (handled by the
 * viewer dialog) go to the previous/next file. Escape closes find before the viewer.
 */
export function PdfView({ item, onInfo, fallback }: {
  item: DocItem
  onInfo?: (info: { page: number; pages: number }) => void
  /** Rendered when the PDF can't be opened (damaged, encrypted…). */
  fallback: (error: string) => React.ReactNode
}) {
  const url = contentUrl(item.path)
  const posKey = positionKey(item.path, item.modified)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [ready, setReady] = useState(false)
  const [page, setPage] = useState(1)
  const [scale, setScale] = useState(1)
  const [scaleValue, setScaleValue] = useState('')
  const [find, setFind] = useState<FindUi>(FIND_CLOSED)
  const [sidebar, setSidebar] = useState(false)
  const [tab, setTab] = useState<SidebarTab>('pages')
  const [pageDraft, setPageDraft] = useState<string | null>(null)

  const container = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const busRef = useRef<Bus | null>(null)
  const findInput = useRef<HTMLInputElement>(null)
  const findReturn = useRef<HTMLElement | null>(null)
  const printFrame = useRef<HTMLIFrameElement | null>(null)
  const infoRef = useRef(onInfo)
  useEffect(() => { infoRef.current = onInfo }, [onInfo])

  // 1. Open the document, the viewer component and its stylesheet together.
  useEffect(() => {
    let closed = false
    const css = acquireViewerCss()
    const book = openPdf(url)
    Promise.all([book, loadPdfViewer(), css.ready])
      .then(async ([b, { core, viewer: lib }]) => {
        let ratio = 1.414
        let outline: OutlineNode[] = []
        try {
          const vp = (await b.doc.getPage(1)).getViewport({ scale: 1 })
          ratio = vp.height / vp.width
          outline = toOutline(await b.doc.getOutline() as RawOutline[] | null)
        } catch { /* page 1 / outline unreadable: the viewer reports its own errors */ }
        if (closed) { b.close(); return }
        setLoaded({ url, doc: b.doc, lib, annotationMode: core.AnnotationMode.ENABLE, ratio, outline, error: null })
      })
      .catch(e => {
        book.then(b => b.close(), () => {})
        if (!closed) setLoaded({ url, doc: null, error: errorText(e) })
      })
    return () => {
      closed = true
      book.then(b => b.close(), () => {})
      css.release()
      printFrame.current?.remove()
      printFrame.current = null
    }
  }, [url])

  const current = loaded?.url === url ? loaded : null
  const doc = current?.doc ?? null
  const lib = current && current.doc ? current.lib : null
  const annotationMode = current && current.doc ? current.annotationMode : 0
  const pages = doc?.numPages ?? 0

  // 2. One PDFViewer per document, wired to React state through the event bus.
  useEffect(() => {
    const el = container.current
    if (!doc || !lib || !el) return
    const ac = new AbortController()
    const bus = new lib.EventBus()
    const link = new lib.PDFLinkService({ eventBus: bus, externalLinkTarget: lib.LinkTarget.BLANK, externalLinkRel: 'noopener noreferrer nofollow' })
    const finder = new lib.PDFFindController({ linkService: link, eventBus: bus, updateMatchesCountOnProgress: true })
    const options: ViewerOptions = {
      container: el,
      eventBus: bus,
      linkService: link,
      findController: finder,
      annotationMode,
      // Phones: no 9 px page borders, so Fit width really fills the (overlay-scrollbar) screen.
      removePageBorders: window.matchMedia(PHONE_QUERY).matches,
      imageResourcesPath: '/api/pdfjs/legacy/web/images/',
      abortSignal: ac.signal,
    }
    const viewer = new lib.PDFViewer(options)
    link.setViewer(viewer)
    viewerRef.current = viewer
    busRef.current = bus

    let inited = false
    let saveTimer: ReturnType<typeof setTimeout> | null = null
    const save = () => {
      if (!inited) return
      const value = viewer.currentScaleValue
      const zoom: ZoomValue = isZoomValue(value) ? value : `${clampScale(Math.round(viewer.currentScale * 100) / 100)}`
      savePosition(browserStore(), posKey, { page: viewer.currentPageNumber, zoom, rotation: viewer.pagesRotation })
    }
    const scheduleSave = () => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(save, 350)
    }

    bus.on('pagesinit', () => {
      const saved = loadPosition(browserStore(), posKey, doc.numPages)
      if (saved?.rotation) viewer.pagesRotation = saved.rotation
      if (saved) viewer.currentScaleValue = saved.zoom
      else {
        const isPhone = window.matchMedia(PHONE_QUERY).matches
        if (!isPhone) viewer.currentScaleValue = 'page-fit'
        viewer.currentScaleValue = defaultZoom(isPhone, viewer.currentScale)
      }
      if (saved && saved.page > 1) viewer.currentPageNumber = saved.page
      inited = true
      setReady(true)
    })
    bus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
      setPage(pageNumber)
      infoRef.current?.({ page: pageNumber, pages: doc.numPages })
      scheduleSave()
    })
    bus.on('scalechanging', ({ scale: s }: { scale: number }) => {
      setScale(s)
      setScaleValue(viewer.currentScaleValue)
      scheduleSave()
    })
    bus.on('rotationchanging', scheduleSave)
    bus.on('updatefindmatchescount', ({ matchesCount }: { matchesCount: { current: number; total: number } }) => {
      setFind(f => (f.open ? { ...f, current: matchesCount.current, total: matchesCount.total } : f))
    })
    bus.on('updatefindcontrolstate', ({ state, matchesCount }: { state: number; matchesCount: { current: number; total: number } }) => {
      const status: FindStatus = state === FIND_PENDING ? 'pending' : state === FIND_NOT_FOUND ? 'notfound' : 'found'
      setFind(f => (f.open ? { ...f, status, current: matchesCount.current, total: matchesCount.total } : f))
    })

    viewer.setDocument(doc)
    link.setDocument(doc)
    finder.setDocument(doc)
    infoRef.current?.({ page: 1, pages: doc.numPages })

    // Presets (Fit width / Fit page) follow the window size.
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const v = viewer.currentScaleValue
        if (inited && (v === 'page-width' || v === 'page-fit' || v === 'auto')) viewer.currentScaleValue = v
      })
    })
    ro.observe(el)

    // Ctrl/Cmd+wheel (and trackpad pinch, which arrives as ctrl+wheel) and two-finger pinch.
    const originOf = (x: number, y: number): [number, number] => {
      const r = el.getBoundingClientRect()
      return [x - r.left + el.offsetLeft, y - r.top + el.offsetTop]
    }
    const zoomBy = (factor: number, origin: [number, number]) => {
      const f = boundedFactor(viewer.currentScale, factor)
      if (Math.abs(f - 1) < 0.005) return false
      const before = viewer.currentScale
      viewer.updateScale({ scaleFactor: f, origin, drawingDelay: 400 })
      return viewer.currentScale !== before
    }
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomBy(wheelFactor(e.deltaY, e.deltaMode), originOf(e.clientX, e.clientY))
    }
    let pinch: number | null = null
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onTouchStart = (e: TouchEvent) => { pinch = e.touches.length === 2 ? spread(e.touches) : null }
    const onTouchMove = (e: TouchEvent) => {
      if (pinch == null || e.touches.length !== 2) return
      e.preventDefault()
      const d = spread(e.touches)
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2
      if (pinch > 0 && zoomBy(d / pinch, originOf(cx, cy))) pinch = d
    }
    const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null }
    el.addEventListener('wheel', onWheel, { passive: false, signal: ac.signal })
    el.addEventListener('touchstart', onTouchStart, { passive: true, signal: ac.signal })
    el.addEventListener('touchmove', onTouchMove, { passive: false, signal: ac.signal })
    el.addEventListener('touchend', onTouchEnd, { signal: ac.signal })
    el.addEventListener('touchcancel', onTouchEnd, { signal: ac.signal })

    return () => {
      if (saveTimer) { clearTimeout(saveTimer); save() }
      cancelAnimationFrame(raf)
      ro.disconnect()
      ac.abort()
      finder.setDocument(null as unknown as PDFDocumentProxy)
      viewer.setDocument(null as unknown as PDFDocumentProxy)
      link.setDocument(null)
      viewerRef.current = null
      busRef.current = null
    }
  }, [doc, lib, annotationMode, posKey])

  // --- actions ----------------------------------------------------------------------

  const goPage = useCallback((n: number) => {
    const v = viewerRef.current
    if (v && n >= 1 && n <= v.pagesCount) v.currentPageNumber = n
  }, [])
  const setZoom = useCallback((value: ZoomValue) => {
    const v = viewerRef.current
    if (v) v.currentScaleValue = value
  }, [])
  const zoomStep = useCallback((dir: 1 | -1) => {
    const v = viewerRef.current
    if (v) v.currentScale = stepZoom(v.currentScale, dir)
  }, [])
  const resetZoom = useCallback(() => {
    const v = viewerRef.current
    if (!v) return
    const isPhone = window.matchMedia(PHONE_QUERY).matches
    if (!isPhone) v.currentScaleValue = 'page-fit'
    v.currentScaleValue = defaultZoom(isPhone, v.currentScale)
  }, [])
  const rotate = useCallback(() => {
    const v = viewerRef.current
    if (v) v.pagesRotation = (v.pagesRotation + 90) % 360
  }, [])

  const dispatchFind = useCallback((query: string, type: '' | 'again', previous = false) => {
    busRef.current?.dispatch('find', {
      source: null, type, query, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: previous, matchDiacritics: false,
    })
  }, [])
  const openFind = useCallback(() => {
    if (!document.activeElement || !findInput.current || document.activeElement !== findInput.current) {
      findReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    setFind(f => (f.open ? f : { ...FIND_CLOSED, open: true }))
    requestAnimationFrame(() => { findInput.current?.focus(); findInput.current?.select() })
  }, [])
  const closeFind = useCallback(() => {
    busRef.current?.dispatch('findbarclose', { source: null })
    setFind(FIND_CLOSED)
    const back = findReturn.current
    findReturn.current = null
    requestAnimationFrame(() => {
      if (back?.isConnected) back.focus({ preventScroll: true })
      else container.current?.focus({ preventScroll: true })
    })
  }, [])
  // Escape closes find first (the newest Escape layer), then the viewer.
  useEscape(closeFind, find.open)

  const print = useCallback(() => {
    // Touch devices (iOS can't print a framed PDF): open it in a tab with the system viewer.
    if (window.matchMedia('(pointer: coarse)').matches) { window.open(url, '_blank', 'noopener'); return }
    printFrame.current?.remove()
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;border:0'
    frame.src = url
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
      } catch {
        window.open(url, '_blank', 'noopener')
      }
    }, { once: true })
    document.body.appendChild(frame)
    printFrame.current = frame
  }, [url])

  // Reader keys (not while typing, not under another dialog).
  useEffect(() => {
    if (!ready) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey) return
      if (document.querySelectorAll('[aria-modal="true"]').length > 1) return
      const v = viewerRef.current
      if (!v) return
      const mod = e.metaKey || e.ctrlKey
      const k = e.key
      if (mod) {
        if (k.toLowerCase() === 'f' && !e.shiftKey) { e.preventDefault(); openFind() }
        else if (k === '=' || k === '+') { e.preventDefault(); zoomStep(1) }
        else if (k === '-' || k === '_') { e.preventDefault(); zoomStep(-1) }
        else if (k === '0') { e.preventDefault(); resetZoom() }
        return
      }
      if (isTyping(e.target)) return
      const el = container.current
      switch (k) {
        case 'ArrowLeft':
        case 'ArrowRight':
          if (e.shiftKey) return // previous / next file (DocumentViewer)
          e.preventDefault()
          if (k === 'ArrowLeft') v.previousPage()
          else v.nextPage()
          return
        case 'PageUp': e.preventDefault(); v.previousPage(); return
        case 'PageDown': e.preventDefault(); v.nextPage(); return
        case 'Home': e.preventDefault(); v.currentPageNumber = 1; return
        case 'End': e.preventDefault(); v.currentPageNumber = v.pagesCount; return
        case 'ArrowUp':
        case 'ArrowDown':
          // Inside the scroller the browser scrolls natively; elsewhere (toolbar focus) do it here.
          if (el && !el.contains(document.activeElement)) {
            e.preventDefault()
            el.scrollBy({ top: k === 'ArrowUp' ? -64 : 64 })
          }
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready, openFind, zoomStep, resetZoom])

  // --- render ---------------------------------------------------------------------------

  if (current?.error) return <>{fallback(current.error)}</>

  const commitPage = () => {
    if (pageDraft == null) return
    const n = parsePageInput(pageDraft, pages)
    setPageDraft(null)
    if (n) goPage(n)
  }
  const pageField = (compact: boolean) => (
    <label className={`flex items-center gap-1.5 text-[13px] tabular-nums text-white/60 ${compact ? '' : 'px-1'}`}>
      {!compact && <span>Page</span>}
      <input
        value={pageDraft ?? String(page)}
        onChange={e => setPageDraft(e.target.value)}
        onFocus={e => e.currentTarget.select()}
        onBlur={commitPage}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commitPage(); e.currentTarget.blur() }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setPageDraft(null); e.currentTarget.blur() }
        }}
        inputMode="numeric"
        enterKeyHint="go"
        aria-label={`Page number, ${pages} pages`}
        disabled={!ready}
        style={{ width: `${Math.max(2, String(pages).length) + 2.2}ch` }}
        className="h-8 rounded-[8px] border border-white/10 bg-white/[0.06] px-1.5 text-center text-[13.5px] font-semibold text-ink outline-none transition focus:border-[var(--accent)]"
      />
      <span>of {pages || '…'}</span>
    </label>
  )

  const btn = 'grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-35 disabled:hover:bg-transparent'
  const zoomItems = (close: () => void) => ZOOM_MENU.map(z => {
    const active = scaleValue === z.value
    return (
      <button key={z.value} type="button" role="menuitemradio" aria-checked={active} className={popItem} onClick={() => { setZoom(z.value); close() }}>
        <span className="flex-1">{z.label}</span>
        {active && <CheckIcon className="h-4 w-4 text-accent" />}
      </button>
    )
  })
  const findCount = !find.query.trim() ? '' : find.status === 'notfound' ? 'No matches'
    : find.total > 0 ? `${find.current} of ${find.total}` : 'Searching…'

  return (
    <div className="reel-pdf flex h-full flex-col">
      <style>{READER_CSS}</style>

      {/* Desktop toolbar */}
      <div role="toolbar" aria-label="PDF tools" className="hidden h-12 shrink-0 items-center gap-1 border-b border-white/[0.06] px-2 md:flex md:px-3">
        <button type="button" className={`${btn} ${sidebar ? 'bg-white/[0.12] text-white' : ''}`} aria-pressed={sidebar} aria-label="Page thumbnails" title="Page thumbnails" onClick={() => setSidebar(s => !s)} disabled={!ready}>
          <SidebarIcon className="h-5 w-5" />
        </button>
        <span className="mx-1 h-5 w-px bg-white/10" aria-hidden />
        <button type="button" className={btn} aria-label="Previous page" title="Previous page" onClick={() => goPage(page - 1)} disabled={!ready || page <= 1}>
          <ChevronUpSmall className="h-5 w-5" />
        </button>
        <button type="button" className={btn} aria-label="Next page" title="Next page" onClick={() => goPage(page + 1)} disabled={!ready || page >= pages}>
          <ChevronDownSmall className="h-5 w-5" />
        </button>
        {pageField(false)}
        <div className="flex-1" />
        <button type="button" className={btn} aria-label="Zoom out" title="Zoom out" onClick={() => zoomStep(-1)} disabled={!ready || scale <= 0.25}>
          <ZoomOutIcon className="h-5 w-5" />
        </button>
        <Popover
          label={`Zoom, ${zoomLabel(scale)}`}
          title="Zoom"
          trigger={<><span className="tabular-nums">{zoomLabel(scale)}</span><ChevronDownSmall className="h-3.5 w-3.5 text-white/50" /></>}
          triggerClassName="inline-flex h-9 min-w-[84px] items-center justify-center gap-1 rounded-[10px] border border-white/10 bg-white/[0.06] px-2.5 text-[13px] font-semibold text-ink transition hover:bg-white/[0.12]"
          align="right"
          width={170}
        >
          {zoomItems}
        </Popover>
        <button type="button" className={btn} aria-label="Zoom in" title="Zoom in" onClick={() => zoomStep(1)} disabled={!ready || scale >= 4}>
          <ZoomInIcon className="h-5 w-5" />
        </button>
        <span className="mx-1 h-5 w-px bg-white/10" aria-hidden />
        <button type="button" className={btn} aria-label="Rotate" title="Rotate clockwise" onClick={rotate} disabled={!ready}>
          <RotateIcon className="h-5 w-5" />
        </button>
        <button type="button" className={`${btn} ${find.open ? 'bg-white/[0.12] text-white' : ''}`} aria-label="Find in document" title="Find (⌘F)" aria-expanded={find.open} onClick={() => (find.open ? closeFind() : openFind())} disabled={!ready}>
          <FindIcon className="h-5 w-5" />
        </button>
        <button type="button" className={btn} aria-label="Print" title="Print" onClick={print} disabled={!ready}>
          <PrintIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {sidebar && doc && ready && (
          <div className="hidden md:flex">
            <PdfSidebar
              doc={doc}
              pages={pages}
              ratio={current && current.doc ? current.ratio : 1.414}
              page={page}
              outline={current && current.doc ? current.outline : []}
              tab={tab}
              onTab={setTab}
              onPage={goPage}
              onOutline={node => {
                if (node.dest) void viewerRef.current?.linkService.goToDestination(node.dest)
                else if (node.url) window.open(node.url, '_blank', 'noopener,noreferrer')
              }}
            />
          </div>
        )}
        <div className="relative min-w-0 flex-1">
          <div
            ref={container}
            tabIndex={0}
            aria-label={`${item.name}, ${pages} page${pages === 1 ? '' : 's'}`}
            className="pdf-canvas absolute inset-0 overflow-auto overscroll-contain outline-none [touch-action:pan-x_pan-y] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/25"
          >
            <div className="pdfViewer" />
          </div>
          {!ready && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#3b3b40]">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" aria-label="Loading PDF" role="status" />
            </div>
          )}
          {find.open && (
            <div
              role="search"
              aria-label="Find in document"
              className="absolute left-2 right-2 top-2 z-20 flex items-center gap-1 rounded-[14px] border border-white/10 bg-[#17131d]/95 py-1 pl-3 pr-1 shadow-[0_18px_44px_rgba(0,0,0,0.5)] backdrop-blur-xl md:left-auto md:right-4 md:top-3 md:w-[380px]"
            >
              <FindIcon className="h-4 w-4 shrink-0 text-white/45" />
              <input
                ref={findInput}
                autoFocus
                value={find.query}
                onChange={e => {
                  const query = e.target.value
                  setFind(f => ({ ...f, query, current: 0, total: 0, status: query.trim() ? 'pending' : 'idle' }))
                  dispatchFind(query, '')
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); if (find.query.trim()) dispatchFind(find.query, 'again', e.shiftKey) }
                }}
                placeholder="Find in document"
                aria-label="Find in document"
                aria-describedby="pdf-find-count"
                autoComplete="off"
                spellCheck={false}
                className="h-9 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-white/40"
              />
              <span id="pdf-find-count" aria-live="polite" className={`shrink-0 px-1 text-[12px] tabular-nums ${find.status === 'notfound' ? 'text-[#ff8a8a]' : 'text-white/55'}`}>{findCount}</span>
              <button type="button" className={btn} aria-label="Previous match" title="Previous match (⇧Enter)" disabled={find.total === 0} onClick={() => dispatchFind(find.query, 'again', true)}>
                <ChevronUpSmall className="h-4 w-4" />
              </button>
              <button type="button" className={btn} aria-label="Next match" title="Next match (Enter)" disabled={find.total === 0} onClick={() => dispatchFind(find.query, 'again')}>
                <ChevronDownSmall className="h-4 w-4" />
              </button>
              <button type="button" className={btn} aria-label="Close find" title="Close (Esc)" onClick={closeFind}>
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Phone bar */}
      <div role="toolbar" aria-label="PDF tools" className="flex shrink-0 items-center gap-1 border-t border-white/[0.07] bg-[#0f0d13] px-2 pb-[calc(env(safe-area-inset-bottom)+6px)] pt-1.5 md:hidden">
        <button type="button" className={btn} aria-label="Previous page" onClick={() => goPage(page - 1)} disabled={!ready || page <= 1}>
          <ChevronUpSmall className="h-5 w-5" />
        </button>
        {pageField(true)}
        <button type="button" className={btn} aria-label="Next page" onClick={() => goPage(page + 1)} disabled={!ready || page >= pages}>
          <ChevronDownSmall className="h-5 w-5" />
        </button>
        <div className="flex-1" />
        <span className="px-1 text-[12px] tabular-nums text-white/45" aria-hidden>{ready ? zoomLabel(scale) : ''}</span>
        <button type="button" className={btn} aria-label="Find in document" onClick={() => (find.open ? closeFind() : openFind())} disabled={!ready}>
          <FindIcon className="h-5 w-5" />
        </button>
        <Popover
          label="More PDF actions"
          trigger={<MoreDotsIcon className="h-5 w-5" />}
          triggerClassName={btn}
          placement="up"
          align="right"
          width={220}
        >
          {close => (
            <>
              <button type="button" role="menuitem" className={popItem} onClick={() => { close(); openFind() }}><FindIcon className="h-[18px] w-[18px] text-white/55" />Find in document</button>
              <button type="button" role="menuitem" className={popItem} disabled={scale >= 4} onClick={() => zoomStep(1)}><ZoomInIcon className="h-[18px] w-[18px] text-white/55" />Zoom in</button>
              <button type="button" role="menuitem" className={popItem} disabled={scale <= 0.25} onClick={() => zoomStep(-1)}><ZoomOutIcon className="h-[18px] w-[18px] text-white/55" />Zoom out</button>
              <button type="button" role="menuitem" className={popItem} onClick={() => { setZoom('page-width'); close() }}><FitWidthIcon className="h-[18px] w-[18px] text-white/55" />Fit width</button>
              <button type="button" role="menuitem" className={popItem} onClick={() => { setZoom('page-fit'); close() }}><FitPageIcon className="h-[18px] w-[18px] text-white/55" />Fit page</button>
              <div className="mx-2 my-1 h-px bg-white/[0.08]" role="separator" />
              <button type="button" role="menuitem" className={popItem} onClick={() => { rotate(); close() }}><RotateIcon className="h-[18px] w-[18px] text-white/55" />Rotate</button>
              <button type="button" role="menuitem" className={popItem} onClick={() => { close(); print() }}><PrintIcon className="h-[18px] w-[18px] text-white/55" />Print</button>
              <button type="button" role="menuitem" className={popItem} onClick={() => { close(); downloadFile(item) }}><DownloadIcon className="h-[18px] w-[18px] text-white/55" />Download</button>
            </>
          )}
        </Popover>
      </div>
    </div>
  )
}
