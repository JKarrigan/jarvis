import 'server-only'
import { JellyfinError, isItemId } from '@/lib/jellyfinServer'

/** Shared bits for the /api/jellyfin route handlers. */

export function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400 })
}

export function invalidId(): Response {
  return badRequest('Invalid id')
}

/** Resolve the dynamic `[id]` param and validate it as a Jellyfin item id. */
export async function itemIdParam(params: Promise<{ id: string }>): Promise<string | null> {
  const { id } = await params
  return isItemId(id) ? id : null
}

/** Map a thrown error to a response: Jellyfin outages keep their status, the rest are 500s. */
export function errorResponse(e: unknown): Response {
  if (e instanceof JellyfinError) return Response.json({ error: 'Jellyfin unavailable' }, { status: e.status >= 500 ? e.status : 502 })
  console.error('[jellyfin route]', e)
  return Response.json({ error: 'Internal error' }, { status: 500 })
}

export const TOO_LARGE = Symbol('too-large')

/**
 * Read a request body, refusing anything over `max` bytes — by Content-Length before
 * reading, and while streaming for chunked bodies (never buffers more than `max`).
 */
export async function readCapped(request: Request, max: number): Promise<Uint8Array | typeof TOO_LARGE> {
  const declared = Number(request.headers.get('content-length') ?? NaN)
  if (Number.isFinite(declared) && declared > max) return TOO_LARGE
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      return TOO_LARGE
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.byteLength }
  return out
}

/** Capped JSON body: TOO_LARGE, null on malformed JSON, else the parsed value. */
export async function readJsonCapped<T>(request: Request, max: number): Promise<T | null | typeof TOO_LARGE> {
  const bytes = await readCapped(request, max)
  if (bytes === TOO_LARGE) return TOO_LARGE
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch {
    return null
  }
}

export function tooLarge(max: number): Response {
  return Response.json({ error: `Body larger than ${Math.round(max / 1024)} KB` }, { status: 413 })
}
