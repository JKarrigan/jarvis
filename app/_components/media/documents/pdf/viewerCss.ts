// pdf.js's viewer stylesheet (pages, text layer, annotation links, find highlights),
// served from node_modules by /api/pdfjs. It carries global rules (`:root` variables,
// generic class names), so instead of bundling it into the app it is attached as a
// <link> only while a PDF reader is mounted and removed when the last one closes.

const HREF = '/api/pdfjs/legacy/web/pdf_viewer.css'

let users = 0
let link: HTMLLinkElement | null = null
let ready: Promise<void> | null = null

/** Attach the stylesheet (refcounted); resolves once it has loaded. Call the returned release once. */
export function acquireViewerCss(): { ready: Promise<void>; release: () => void } {
  users++
  if (!link) {
    const el = document.createElement('link')
    el.rel = 'stylesheet'
    el.href = HREF
    el.dataset.pdfViewerCss = ''
    // A failed stylesheet still lets the reader work (unstyled text layer); don't block on it.
    ready = new Promise<void>(resolve => {
      el.addEventListener('load', () => resolve(), { once: true })
      el.addEventListener('error', () => resolve(), { once: true })
    })
    document.head.appendChild(el)
    link = el
  }
  let released = false
  return {
    ready: ready ?? Promise.resolve(),
    release: () => {
      if (released) return
      released = true
      users = Math.max(0, users - 1)
      if (users === 0 && link) {
        link.remove()
        link = null
        ready = null
      }
    },
  }
}
