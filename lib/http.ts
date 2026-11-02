import 'server-only'
import net from 'net'

/**
 * Shared request helpers for API routes.
 *
 * The app has no authentication (LAN only), so the one line of defence against
 * a malicious website driving state-changing endpoints from a household
 * member's browser is a same-origin check on every mutating handler.
 */

/**
 * Returns a 403 Response when the request clearly comes from another origin,
 * otherwise null. Browsers send `Sec-Fetch-Site` on every request; older
 * clients and curl send neither header and are allowed (they are not subject
 * to cross-site attacks). Never put this in proxy.ts: Next buffers request
 * bodies there (10 MB default), which would break large uploads.
 */
export function assertSameOrigin(request: Request): Response | null {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return forbidden()

  const origin = request.headers.get('origin')
  if (origin) {
    const host = request.headers.get('host')
    let originHost: string | null = null
    try { originHost = new URL(origin).host } catch { return forbidden() }
    if (!host || originHost !== host) return forbidden()
  }
  return null
}

function forbidden(): Response {
  return Response.json({ error: 'Cross-origin request rejected' }, { status: 403 })
}

/** Parses an integer query parameter, clamping it into [min, max]; NaN/missing → def. */
export function intParam(
  raw: string | null | undefined,
  { def, min = 0, max = Number.MAX_SAFE_INTEGER }: { def: number; min?: number; max?: number },
): number {
  if (raw == null || raw === '') return def
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, n))
}

/** Parses a finite number query parameter within [min, max]; otherwise null. */
export function numParam(raw: string | null | undefined, min: number, max: number): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return n
}

/**
 * Validates a LAN device host supplied by the client: a private IPv4 address
 * (RFC 1918 / link-local) or a `.local` mDNS name (underscores allowed:
 * AirGradient devices default to `airgradient_<serial>.local`). No port, no path.
 */
export function isLanHost(host: unknown): host is string {
  if (typeof host !== 'string' || host.length > 253) return false
  if (net.isIPv4(host)) {
    const [a, b] = host.split('.').map(Number)
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  }
  return /^[a-z0-9]([a-z0-9_-]{0,61}[a-z0-9])?\.local$/i.test(host)
}

/** Result of parsing an HTTP Range header against a resource of `size` bytes. */
export type ByteRange = { start: number; end: number } | 'invalid' | null

/**
 * Parses a single `bytes=` range (RFC 9110). Returns null when the header is
 * absent or unparsable (serve the whole resource with 200), 'invalid' when it
 * cannot be satisfied (respond 416 with `Content-Range: bytes * /size`), and the
 * clamped inclusive range otherwise.
 */
export function parseRange(header: string | null, size: number): ByteRange {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  if (size <= 0) return 'invalid'
  let start: number
  let end: number
  if (m[1] === '') {
    if (m[2] === '') return null
    const suffix = Number(m[2])
    if (suffix === 0) return 'invalid'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return 'invalid'
  return { start, end }
}

export function rangeNotSatisfiable(size: number): Response {
  return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
}

/** Reads a JSON body only when it is small enough; returns null on bad input. */
export async function readJson<T = unknown>(request: Request, maxBytes = 256 * 1024): Promise<T | null> {
  const len = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(len) && len > maxBytes) return null
  try {
    const text = await request.text()
    if (text.length > maxBytes) return null
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

/**
 * `filename` (ASCII fallback) plus RFC 5987 `filename*` with the UTF-8 name. encodeURIComponent
 * leaves ' ( ) * ! unescaped, but ' is the ext-value delimiter and the others aren't attr-chars.
 */
export function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const name = filename.normalize('NFC')
  const ascii = name.replace(/[^\x20-\x7e]|["\\%]/g, '_')
  const ext = encodeURIComponent(name).replace(/['()*!]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${ext}`
}
