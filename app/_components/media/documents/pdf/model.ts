// Pure helpers behind the Documents PDF reader: zoom steps and presets, the default
// zoom, page-number input parsing and the remembered reading position per document.
// React- and DOM-free (localStorage is passed in) so they are unit-tested.

/** pdf.js preset scale values (`PDFViewer.currentScaleValue`). */
export type ZoomPreset = 'page-width' | 'page-fit'
/** A preset or a numeric scale written as a string ("1.25"), as pdf.js stores it. */
export type ZoomValue = ZoomPreset | `${number}`

export const MIN_SCALE = 0.25
export const MAX_SCALE = 4

/** Steps for the − / + buttons and Ctrl/Cmd +/−. */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]

/** The zoom menu: the two fits, then 50–400 %. */
export const ZOOM_MENU: { value: ZoomValue; label: string }[] = [
  { value: 'page-width', label: 'Fit width' },
  { value: 'page-fit', label: 'Fit page' },
  ...[0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map(s => ({ value: `${s}` as ZoomValue, label: `${Math.round(s * 100)} %` })),
]

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/** The next step up (dir 1) or down (dir -1) from `scale`, skipping steps within 1 % of it. */
export function stepZoom(scale: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find(s => s > scale * 1.01) ?? MAX_SCALE
  return [...ZOOM_STEPS].reverse().find(s => s < scale * 0.99) ?? MIN_SCALE
}

/**
 * A pinch / Ctrl+wheel factor limited so the result stays within MIN–MAX
 * (pdf.js itself would go from 10 % to 2500 %).
 */
export function boundedFactor(scale: number, factor: number): number {
  if (!(scale > 0) || !Number.isFinite(factor) || factor <= 0) return 1
  return clampScale(scale * factor) / scale
}

/** Ctrl/Cmd+wheel delta → scale factor (pixel deltas; line deltas are ~40 px each). */
export function wheelFactor(deltaY: number, deltaMode: number): number {
  const px = deltaMode === 1 ? deltaY * 40 : deltaMode === 2 ? deltaY * 400 : deltaY
  return Math.exp(-Math.max(-60, Math.min(60, px)) / 120)
}

/** "125 %" for the zoom button; presets show the scale they resolved to. */
export function zoomLabel(scale: number): string {
  return `${Math.round(scale * 100)} %`
}

/**
 * Opening zoom when nothing is remembered: phones fit the width; desktop fits the page,
 * but never above 100 % (a small page doesn't open blown up).
 */
export function defaultZoom(phone: boolean, pageFitScale: number): ZoomValue {
  if (phone) return 'page-width'
  return pageFitScale > 1 ? '1' : 'page-fit'
}

export function isZoomValue(v: unknown): v is ZoomValue {
  if (v === 'page-width' || v === 'page-fit') return true
  if (typeof v !== 'string' || v.trim() === '') return false
  const n = Number(v)
  return Number.isFinite(n) && n >= MIN_SCALE && n <= MAX_SCALE
}

/** The page-number field: a whole number within 1…pages, else null (the field reverts). */
export function parsePageInput(raw: string, pages: number): number | null {
  const t = raw.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  if (n < 1 || n > pages) return null
  return n
}

// --- remembered position ------------------------------------------------------------

export interface SavedPosition { page: number; zoom: ZoomValue; rotation: number }

export const POSITIONS_KEY = 'reel.documents.pdf.v1'
/** Positions kept (most recently read first); older ones are dropped. */
export const MAX_POSITIONS = 200

type Store = Pick<Storage, 'getItem' | 'setItem'>
type Entry = SavedPosition & { k: string; t: number }

/** One document version: a replaced file (new mtime) starts from the top again. */
export function positionKey(path: string, modified: number): string {
  return `${path}\u0000${modified}`
}

function readEntries(store: Store | null): Entry[] {
  if (!store) return []
  try {
    const raw: unknown = JSON.parse(store.getItem(POSITIONS_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.flatMap((e: unknown): Entry[] => {
      if (!e || typeof e !== 'object') return []
      const r = e as Record<string, unknown>
      if (typeof r.k !== 'string' || typeof r.page !== 'number' || !Number.isInteger(r.page) || r.page < 1) return []
      if (!isZoomValue(r.zoom)) return []
      const rotation = typeof r.rotation === 'number' && [0, 90, 180, 270].includes(r.rotation) ? r.rotation : 0
      return [{ k: r.k, page: r.page, zoom: r.zoom, rotation, t: typeof r.t === 'number' ? r.t : 0 }]
    })
  } catch {
    return []
  }
}

export function loadPosition(store: Store | null, key: string, pages: number): SavedPosition | null {
  const e = readEntries(store).find(x => x.k === key)
  if (!e) return null
  return { page: Math.min(Math.max(1, e.page), Math.max(1, pages)), zoom: e.zoom, rotation: e.rotation }
}

export function savePosition(store: Store | null, key: string, pos: SavedPosition, now = Date.now()): void {
  if (!store) return
  const rest = readEntries(store).filter(e => e.k !== key)
  const next: Entry[] = [{ k: key, ...pos, t: now }, ...rest].slice(0, MAX_POSITIONS)
  try { store.setItem(POSITIONS_KEY, JSON.stringify(next)) } catch { /* full or blocked: not remembered */ }
}

/** localStorage, or null where it is unavailable (private mode, blocked storage). */
export function browserStore(): Store | null {
  try { return window.localStorage } catch { return null }
}
