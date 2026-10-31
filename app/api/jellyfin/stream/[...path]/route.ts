import {
  JellyfinError, STREAM_PREFIX, isMockMode, jfFetch, proxied, stripApiKey,
} from '@/lib/jellyfinServer'

/**
 * Same-origin proxy for everything the browser loads from Jellyfin — images,
 * direct-play files and HLS playlists/segments. The Jellyfin token is added
 * upstream here and never reaches the client (no api_key in any URL).
 *
 * - Range / conditional headers and the client's abort signal pass straight
 *   through; the body is streamed back untouched (no buffering), so direct play
 *   seeks and starts as fast as hitting Jellyfin directly.
 * - .m3u8 playlists are rewritten so absolute segment/variant URLs stay under this
 *   proxy and carry no credentials (relative ones already resolve here).
 * - Only the read-only paths playback needs are allowed.
 */

const ALLOWED = [
  // stream.*, master/main.m3u8, hls1/<playlist>/<segment>, <sourceId>/Subtitles/…
  /^videos\/[0-9a-f]{32}\/[\w.,\-/]+$/i,
  /^audio\/[0-9a-f]{32}\/[\w.,\-/]+$/i,
  /^items\/[0-9a-f]{32}\/images\/(primary|backdrop|logo|thumb|banner)(\/\d{1,3})?$/i,
]

const FORWARD_REQUEST = ['range', 'if-range', 'if-none-match', 'if-modified-since']
const FORWARD_RESPONSE = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'etag', 'last-modified']

type Ctx = { params: Promise<{ path: string[] }> }

export function GET(request: Request, ctx: Ctx) {
  return proxy(request, ctx, 'GET')
}

export function HEAD(request: Request, ctx: Ctx) {
  return proxy(request, ctx, 'HEAD')
}

async function proxy(request: Request, { params }: Ctx, method: 'GET' | 'HEAD'): Promise<Response> {
  if (isMockMode()) return Response.json({ error: 'No media streams in mock mode' }, { status: 404 })
  const { path } = await params
  if (!path?.length || path.some(seg => !seg || seg === '.' || seg === '..' || /[/\\]/.test(seg))) {
    return Response.json({ error: 'Bad path' }, { status: 400 })
  }
  const rel = path.join('/')
  if (!ALLOWED.some(re => re.test(rel))) return Response.json({ error: 'Not allowed' }, { status: 403 })

  const search = new URL(request.url).searchParams
  stripApiKey(search)
  const headers: Record<string, string> = { Accept: '*/*', 'Accept-Encoding': 'identity' }
  for (const h of FORWARD_REQUEST) {
    const v = request.headers.get(h)
    if (v) headers[h] = v
  }

  let upstream: Response
  try {
    upstream = await jfFetch(`/${path.map(encodeURIComponent).join('/')}`, {
      method,
      search: search.toString(),
      headers,
      signal: request.signal,
      stream: true,
      timeoutMs: 30_000, // a cold HLS transcode can take a while to produce its first playlist
    })
  } catch (e) {
    if (request.signal.aborted) return new Response(null, { status: 499 })
    const status = e instanceof JellyfinError ? (e.status >= 500 ? e.status : 502) : 502
    return Response.json({ error: 'Jellyfin unavailable' }, { status })
  }

  const out = new Headers({ 'X-Content-Type-Options': 'nosniff' })
  for (const h of FORWARD_RESPONSE) {
    const v = upstream.headers.get(h)
    if (v) out.set(h, v)
  }
  // fetch() transparently decodes compressed bodies; the length would then be wrong.
  if (upstream.headers.get('content-encoding')) out.delete('content-length')

  const type = upstream.headers.get('content-type') ?? ''
  const isPlaylist = /mpegurl/i.test(type) || /\.m3u8$/i.test(rel)
  if (isPlaylist && method === 'GET' && upstream.ok) {
    const text = rewritePlaylist(await upstream.text())
    out.delete('content-length')
    out.set('content-type', type || 'application/vnd.apple.mpegurl')
    out.set('cache-control', 'no-store')
    return new Response(text, { status: upstream.status, headers: out })
  }
  return new Response(method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: out })
}

/** Keep every playlist URL under this proxy and free of credentials. */
function rewritePlaylist(text: string): string {
  return text
    .split('\n')
    .map(line => {
      const t = line.trim()
      if (!t) return line
      if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${rewriteUri(uri)}"`)
      return rewriteUri(t)
    })
    .join('\n')
}

function rewriteUri(uri: string): string {
  // Absolute (http… or /videos/…) → the proxied path; proxied() also drops api_key.
  if (/^https?:\/\//i.test(uri) || uri.startsWith('/')) {
    return uri.startsWith(STREAM_PREFIX) ? uri : proxied(uri)
  }
  // Relative URIs already resolve under this proxy; just strip credentials.
  const q = uri.indexOf('?')
  if (q < 0) return uri
  const sp = new URLSearchParams(uri.slice(q + 1))
  stripApiKey(sp)
  const s = sp.toString()
  return `${uri.slice(0, q)}${s ? `?${s}` : ''}`
}
