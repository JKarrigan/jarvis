import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { libraryMarkerPresent, photoAbs } from '@/lib/photos/config'
import { getPhotoRow, MISSING_PREFIX } from '@/lib/photos/db'
import { isId, jsonError } from '@/lib/photos/http'
import { parseRange } from '@/lib/photos/range'

export const dynamic = 'force-dynamic'

function contentDisposition(type: 'inline' | 'attachment', name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

// GET /api/photos/[id]/file — the original, with single-range support. ?download=1 → attachment.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isId(id)) return jsonError(400, 'Invalid id')
  const row = getPhotoRow(id)
  if (!row || row.rel_path.startsWith(MISSING_PREFIX)) return jsonError(404, 'Not found')

  const abs = photoAbs(row.rel_path)
  let stat: fs.Stats
  try {
    stat = await fs.promises.stat(abs)
    if (!stat.isFile()) return jsonError(404, 'Not found')
  } catch (e) {
    // ENOENT on a mounted library is a real 404; with the mount-guard marker gone it is an offline share.
    const gone = (e as NodeJS.ErrnoException).code === 'ENOENT' && (await libraryMarkerPresent())
    return gone ? jsonError(404, 'Not found') : jsonError(503, 'Library offline', { 'Retry-After': '30' })
  }

  const size = stat.size
  const download = new URL(request.url).searchParams.get('download') === '1'
  const etag = `"${size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`
  const headers: Record<string, string> = {
    'Content-Type': row.mime || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Content-Disposition': contentDisposition(download ? 'attachment' : 'inline', path.basename(row.rel_path)),
    'Cache-Control': 'private, max-age=86400',
    'Last-Modified': stat.mtime.toUTCString(),
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  }

  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })

  // If-Range with a stale validator → send the whole file.
  const ifRange = request.headers.get('if-range')
  const range = ifRange && ifRange !== etag ? { kind: 'full' as const } : parseRange(request.headers.get('range'), size)

  if (range.kind === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
  }

  const [start, end] = range.kind === 'partial' ? [range.start, range.end] : [0, size - 1]
  const length = size === 0 ? 0 : end - start + 1
  const node = size === 0 ? null : fs.createReadStream(abs, { start, end })
  // Readable.toWeb destroys the fs stream when the client disconnects (stream cancel).
  const body = node ? (Readable.toWeb(node) as unknown as ReadableStream<Uint8Array>) : null

  if (range.kind === 'partial') {
    return new Response(body, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(length) },
    })
  }
  return new Response(body, { status: 200, headers: { ...headers, 'Content-Length': String(length) } })
}
