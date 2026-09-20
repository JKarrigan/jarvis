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
