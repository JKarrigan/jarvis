import type { PDFDocumentProxy } from 'pdfjs-dist'

/** pdf.js, loaded on demand (it's large) — the legacy build, for older tablet browsers. */
let lib: Promise<typeof import('pdfjs-dist')> | null = null
function loadPdfjs() {
  if (!lib) {
    lib = import('pdfjs-dist/legacy/build/pdf.mjs').then(m => {
      m.GlobalWorkerOptions.workerSrc = '/api/pdfjs/legacy/build/pdf.worker.min.mjs'
      return m as unknown as typeof import('pdfjs-dist')
    })
  }
  return lib
}

export interface OpenBook {
  doc: PDFDocumentProxy
  /** Abort outstanding requests and release the worker's copy of the file. */
  close: () => void
}

/** Open a book through the range-capable file proxy. Always `close()` it when done. */
export async function openBook(id: string): Promise<OpenBook> {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({
    url: `/api/jellyfin/books/${id}/file`,
    cMapUrl: '/api/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/api/pdfjs/standard_fonts/',
    wasmUrl: '/api/pdfjs/wasm/',
    iccUrl: '/api/pdfjs/iccs/',
  })
  const doc = await task.promise
  return { doc, close: () => { void task.destroy() } }
}

/** Render one page into `canvas`, scaled so it fits inside maxW × maxH CSS pixels. */
export async function renderPage(
  doc: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement,
  maxW: number, maxH: number, pixelRatio = 1,
): Promise<{ cancel: () => void; done: Promise<void> }> {
  const page = await doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const fit = Math.min(maxW / base.width, maxH / base.height)
  const viewport = page.getViewport({ scale: fit * pixelRatio })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`
  canvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`
  const task = page.render({ canvas, viewport })
  return {
    cancel: () => task.cancel(),
    // A cancelled render rejects; that's the normal path when pages are turned quickly.
    done: task.promise.then(() => { }, () => { }),
  }
}

/** One printed character of a page's main text, in CSS pixels relative to the page canvas. */
export interface PageChar { ch: string; x: number; y: number; w: number; h: number }

/**
 * Where each character of the page's *main* text sits, at the same fit-to-box scale
 * renderPage() uses — so boxes can be drawn straight over the canvas. Furigana is left
 * out (it is set much smaller than the body text) and so is anything rotated or vertical.
 * Returns [] for pages with no usable text layer.
 */
export async function pageChars(doc: PDFDocumentProxy, pageNumber: number, maxW: number, maxH: number): Promise<PageChar[]> {
  const pdfjs = await loadPdfjs()
  const page = await doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const fit = Math.min(maxW / base.width, maxH / base.height)
  const viewport = page.getViewport({ scale: fit })
  const content = await page.getTextContent()

  const runs: { chars: string[]; x: number; y: number; w: number; h: number }[] = []
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue
    const tx = pdfjs.Util.transform(viewport.transform, item.transform)
    if (Math.abs(tx[1]) > 0.01 || Math.abs(tx[2]) > 0.01) continue
    const h = Math.hypot(tx[2], tx[3])
    const chars = [...item.str]
    runs.push({ chars, x: tx[4], y: tx[5] - h, w: (item.width * fit) / chars.length, h })
  }
  if (runs.length === 0) return []

  // Body size = the largest type size that still carries a fair share of the page's
  // characters; furigana (about half that size) falls under the cut-off.
  const total = runs.reduce((n, r) => n + r.chars.length, 0)
  const sizes = [...new Set(runs.map(r => Math.round(r.h)))].sort((a, b) => b - a)
  const body = sizes.find(sz => runs.filter(r => Math.round(r.h) === sz).reduce((n, r) => n + r.chars.length, 0) >= total * 0.2) ?? sizes[0]

  const out: PageChar[] = []
  for (const r of runs) {
    if (r.h < body * 0.75) continue
    r.chars.forEach((ch, i) => {
      if (ch.trim()) out.push({ ch, x: r.x + i * r.w, y: r.y, w: r.w, h: r.h })
    })
  }
  return out
}

