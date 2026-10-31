import type { ApiEntry } from '@/lib/fileTypes'

// Small client-side helpers shared by the file browser hooks and modals.

/** Join path segments (or a dir path + a name) into the API's relative path form. */
export function joinPath(...parts: (string | string[])[]): string {
  return parts.flat().filter(Boolean).join('/')
}

/** Read the `{ error }` body the file API returns, falling back to text / status. */
export async function readError(res: Response): Promise<string> {
  let body = ''
  try { body = await res.text() } catch { /* ignore */ }
  if (body) {
    try {
      const data = JSON.parse(body) as { error?: unknown }
      if (typeof data.error === 'string' && data.error) return data.error
    } catch { /* not JSON */ }
    if (body.length < 200) return body
  }
  return res.statusText || `Request failed (${res.status})`
}

/** Error carrying the HTTP status so callers can branch on 409 etc. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

/** fetch() that throws an ApiError with the server's message on a non-2xx answer. */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

/**
 * "Keep both" name: `photo.jpg` → `photo (2).jpg`, or the next free number
 * when that is taken too.
 */
export function keepBothName(name: string, taken: Set<string> | ((n: string) => boolean)): string {
  const isTaken = typeof taken === 'function' ? taken : (n: string) => taken.has(n)
  const dot = name.lastIndexOf('.')
  const hasExt = dot > 0
  const base = hasExt ? name.slice(0, dot) : name
  const ext = hasExt ? name.slice(dot) : ''
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} (${i})${ext}`
    if (!isTaken(candidate)) return candidate
  }
  return `${base} (${Date.now()})${ext}`
}

/** A folder's entries, fresh from the server (not the possibly stale view). */
export async function listEntries(dir: string, signal?: AbortSignal): Promise<ApiEntry[]> {
  const res = await apiFetch(`/api/files/list?path=${encodeURIComponent(dir)}`, { signal })
  const data = (await res.json()) as { entries?: ApiEntry[] }
  return data.entries ?? []
}

export async function listNames(dir: string, signal?: AbortSignal): Promise<Set<string>> {
  return new Set((await listEntries(dir, signal)).map(e => e.name))
}

export function triggerDownload(filePath: string, name: string) {
  const a = document.createElement('a')
  a.href = `/api/files/content?path=${encodeURIComponent(filePath)}&download=true`
  a.download = name
  a.click()
}
