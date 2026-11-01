// Client helpers for the Photos API (app/api/photos/**). Client-safe: no server imports.

import type { Album, PhotoDetail, PhotoItem, PhotoPage, PhotoSummary, PhotoTagCount, ScanStatus, ThumbSize } from '@/lib/photos/types'
import { PHOTO_IMAGE_EXTS, PHOTO_VIDEO_EXTS } from '@/lib/photos/types'

export type { Album, PhotoDetail, PhotoItem, PhotoPage, PhotoSummary, PhotoTagCount, ScanStatus }

/** Error carrying the HTTP status (503 = library offline). */
export class PhotosApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

export function errorText(e: unknown): string {
  if (e instanceof PhotosApiError && e.status === 503) return 'The photo library is offline.'
  if (e instanceof Error) return e.message
  return String(e)
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown }
    if (typeof data.error === 'string' && data.error) return data.error
  } catch { /* not JSON */ }
  return res.statusText || `Request failed (${res.status})`
}

/** fetch() + JSON, throwing PhotosApiError with the server's `{ error }` on non-2xx. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new PhotosApiError(await readError(res), res.status)
  return (await res.json()) as T
}

function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

// --- URLs -------------------------------------------------------------------

/** Derived webp. Thumbs are served immutable, so `v` busts the cache when the file changes. */
/** Bump when the thumbnail pipeline changes, so immutable-cached thumbs are refetched. */
const THUMB_GEN = '-2'

export function thumbUrl(item: Pick<PhotoItem, 'id' | 'size'>, size: ThumbSize = 't'): string {
  return `/api/photos/${item.id}/thumb?size=${size}&v=${item.size.toString(36)}${THUMB_GEN}`
}
export function fileUrl(id: string, download = false): string {
  return `/api/photos/${id}/file${download ? '?download=1' : ''}`
}
export function streamUrl(id: string, t = 0): string {
  return `/api/photos/${id}/stream${t > 0 ? `?t=${t.toFixed(1)}` : ''}`
}

// --- mutations ----------------------------------------------------------------

export const setFavorite = (id: string, favorite: boolean) =>
  sendJson<PhotoDetail>(`/api/photos/${id}`, 'PATCH', { favorite })
/** Replace one item's tags; the response carries the stored spellings. */
export const setTags = (id: string, tags: string[]) =>
  sendJson<PhotoDetail>(`/api/photos/${id}`, 'PATCH', { tags })
/** Bulk add/remove tags on up to 1000 items. */
export const changeTags = (ids: string[], add: string[], remove: string[]) =>
  sendJson<{ ok: true; changed: number }>('/api/photos/tags', 'POST', { ids, add, remove })
export const trashPhoto = (id: string) => sendJson<{ ok: true }>(`/api/photos/${id}`, 'DELETE')
export const restorePhoto = (id: string) => sendJson<{ ok: true }>(`/api/photos/${id}?restore=1`, 'DELETE')
export const deleteForever = (id: string) => sendJson<{ ok: true }>(`/api/photos/${id}?permanent=1`, 'DELETE')
export const emptyTrash = () => sendJson<{ ok: true; deleted: number }>('/api/photos/trash/empty', 'POST')

export const listAlbums = (signal?: AbortSignal) => fetchJson<{ albums: Album[] }>('/api/photos/albums', { signal })
export const createAlbum = (name: string, photoIds: string[] = []) =>
  sendJson<Album>('/api/photos/albums', 'POST', { name, photoIds })
export const updateAlbum = (id: string, patch: { name?: string; coverId?: string | null }) =>
  sendJson<Album>(`/api/photos/albums/${id}`, 'PATCH', patch)
export const deleteAlbum = (id: string) => sendJson<{ ok: true }>(`/api/photos/albums/${id}`, 'DELETE')
export const addToAlbum = (id: string, ids: string[]) =>
  sendJson<{ added: number; album: Album }>(`/api/photos/albums/${id}/items`, 'POST', { ids })
export const removeFromAlbum = (id: string, ids: string[]) =>
  sendJson<{ removed: number; album: Album }>(`/api/photos/albums/${id}/items`, 'DELETE', { ids })
export const startScan = () => sendJson<ScanStatus>('/api/photos/scan', 'POST')

/** Run `fn` over `items` with at most `limit` in flight; resolves with per-item success. */
export async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>): Promise<boolean[]> {
  const ok: boolean[] = new Array(items.length).fill(false)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      try { await fn(items[i]); ok[i] = true } catch { ok[i] = false }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return ok
}

// --- formatting ---------------------------------------------------------------

const SUPPORTED = new Set<string>([...PHOTO_IMAGE_EXTS, ...PHOTO_VIDEO_EXTS])
export function isSupportedName(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot > 0 && SUPPORTED.has(name.slice(dot + 1).toLowerCase())
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const v = n / 1024 ** i
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export function formatCount(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`
}

/** "Sat, 31 Oct 2026 · 14:02" */
export function formatTaken(ms: number): string {
  const d = new Date(ms)
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day.replace(/^(\w+) /, '$1, ')} · ${time}`
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`
}

/** "3 minutes ago" style relative time for the last scan. */
export function relativeTime(ms: number, now = Date.now()): string {
  const s = Math.round((now - ms) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function basename(relPath: string): string {
  return relPath.slice(relPath.lastIndexOf('/') + 1)
}

/** Browsers can show these originals directly (HEIC/TIFF stay on the derived preview). */
export function browserCanShow(mime: string): boolean {
  return /^image\/(jpeg|png|gif|webp|avif|svg\+xml)$/.test(mime)
}
