// Client helpers for the Documents browser over /api/files/**. Client-safe.

import type { ApiEntry, SearchResult } from '@/lib/fileTypes'

/** One file or folder as the browser sees it; `path` (relative to the documents root) is its key. */
export interface DocItem {
  path: string
  name: string
  isDir: boolean
  /** Bytes (0 for folders). */
  size: number
  /** ms since epoch. */
  modified: number
  /** Visible children (folders only). */
  childCount: number
  /** The folder it lives in ('' = root). */
  parent: string
}

export interface DiskInfo { usedBytes: number; totalBytes: number }

export const ROOT_NAME = 'Documents'
export const PATH_SEPARATOR = ' › '

/** Error carrying the HTTP status (409 conflict, 503 storage offline…). */
export class DocsApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: Record<string, unknown> = {}) {
    super(message)
  }
  get offline(): boolean {
    return this.status === 503 || this.body.offline === true
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

export function errorText(e: unknown): string {
  if (e instanceof DocsApiError && e.offline) return 'Documents storage is offline.'
  if (e instanceof Error) return e.message
  return String(e)
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  let body: Record<string, unknown> = {}
  try { body = (await res.json()) as Record<string, unknown> } catch { /* empty or not JSON */ }
  if (!res.ok) {
    const msg = typeof body.error === 'string' && body.error ? body.error : res.statusText || `Request failed (${res.status})`
    throw new DocsApiError(msg, res.status, body)
  }
  return body as T
}

const q = (params: Record<string, string>) => new URLSearchParams(params).toString()

// --- paths --------------------------------------------------------------------

export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}
export function parentOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
/** True when `path` is `ancestor` or anywhere beneath it. */
export function isWithin(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`)
}
/** Normalises a `?folder=` value: no leading/trailing slashes, no empty or dot segments. */
export function cleanFolder(raw: string | null): string {
  if (!raw) return ''
  return raw.split('/').filter(s => s && s !== '.' && s !== '..').join('/')
}
/** "Documents › Taxes › 2025" for a folder path. */
export function pathLabel(folder: string): string {
  return [ROOT_NAME, ...(folder ? folder.split('/') : [])].join(PATH_SEPARATOR)
}

// --- reads --------------------------------------------------------------------

function toItem(e: ApiEntry, parent: string, path = joinPath(parent, e.name)): DocItem {
  const modified = Date.parse(e.modified)
  return {
    path,
    name: e.name,
    isDir: e.kind === 'dir',
    size: e.kind === 'file' ? e.size : 0,
    modified: Number.isNaN(modified) ? 0 : modified,
    childCount: e.kind === 'dir' ? e.childCount : 0,
    parent,
  }
}

export async function listFolder(folder: string, signal?: AbortSignal): Promise<{ items: DocItem[]; disk: DiskInfo | null }> {
  const data = await request<{ entries?: ApiEntry[]; disk?: DiskInfo }>(`/api/files/list?${q({ path: folder })}`, { signal })
  return { items: (data.entries ?? []).map(e => toItem(e, folder)), disk: data.disk ?? null }
}

/** Just the subfolders (Move to… tree). */
export async function listFolders(folder: string, signal?: AbortSignal): Promise<DocItem[]> {
  return (await listFolder(folder, signal)).items.filter(i => i.isDir)
}

export async function searchAll(query: string, signal?: AbortSignal): Promise<{ items: DocItem[]; truncated: boolean }> {
  const data = await request<{ results?: SearchResult[]; truncated?: boolean }>(
    `/api/files/search?${q({ q: query, path: '', limit: '300' })}`, { signal },
  )
  const items = (data.results ?? []).map(r => toItem(r, parentOf(r.relPath), r.relPath))
  return { items, truncated: Boolean(data.truncated) }
}

export interface FolderStat { files: number; folders: number; bytes: number; truncated: boolean }

export function statFolder(path: string, signal?: AbortSignal): Promise<FolderStat> {
  return request<FolderStat>(`/api/files/stat?${q({ path })}`, { signal })
}

export interface StorageStatus { online: boolean; root?: string; disk?: DiskInfo | null }

export function storageStatus(signal?: AbortSignal): Promise<StorageStatus> {
  return request<StorageStatus>('/api/files/status', { signal })
}

// --- writes -------------------------------------------------------------------

export const makeFolder = (path: string) => request<{ ok: true }>(`/api/files/mkdir?${q({ path })}`, { method: 'POST' })
export const renameItem = (path: string, name: string) =>
  request<{ ok: true }>(`/api/files/rename?${q({ path, name })}`, { method: 'POST' })
export const moveItem = (from: string, to: string) =>
  request<{ ok: true }>(`/api/files/move?${q({ from, to })}`, { method: 'POST' })
export const deleteItem = (path: string) => request<{ ok: true }>(`/api/files/delete?${q({ path })}`, { method: 'DELETE' })

/** Runs `fn` over `items` with at most `limit` in flight; resolves to per-item errors (null = ok). */
export async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>): Promise<(unknown | null)[]> {
  const out: (unknown | null)[] = new Array(items.length).fill(null)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      try { await fn(items[i]) } catch (e) { out[i] = e }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// --- URLs -----------------------------------------------------------------------

export function contentUrl(path: string, download = false): string {
  return `/api/files/content?${q(download ? { path, download: '1' } : { path })}`
}
/** Thumbnails are cached by path + mtime on the server; `v` keeps the browser cache honest after edits. */
export function thumbUrl(item: Pick<DocItem, 'path' | 'modified'>, size: 't' | 'p' = 't'): string {
  return `/api/files/thumb?${q({ path: item.path, size, v: String(item.modified) })}`
}

export function downloadFile(item: Pick<DocItem, 'path' | 'name'>) {
  const a = document.createElement('a')
  a.href = contentUrl(item.path, true)
  a.download = item.name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// --- formatting -------------------------------------------------------------------

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const v = n / 1024 ** i
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`
}

/** "3 Oct 2026" (this year: "3 Oct, 14:02"). */
export function formatModified(ms: number, now = Date.now()): string {
  if (!ms) return '—'
  const d = new Date(ms)
  if (d.getFullYear() === new Date(now).getFullYear()) {
    return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
