import { createReadStream } from 'fs'
import fsp from 'fs/promises'
import { Readable } from 'stream'
import path from 'path'
import { parseRange, rangeNotSatisfiable } from '@/lib/http'
import { assertStorageOnline, resolveSafe, filesErrorResponse, FilesError } from '@/lib/files'

export const dynamic = 'force-dynamic'

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  csv: 'text/plain; charset=utf-8',
  pdf: 'application/pdf',
}

/**
 * Types that can run script when opened as a document from this origin. They
 * are always sent as attachments under a sandboxing CSP (an <img> still
 * renders an SVG: subresources ignore Content-Disposition).
 */
const ACTIVE = new Set(['image/svg+xml'])
const SANDBOX_CSP = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"

function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export async function GET(request: Request) {
  const offline = await assertStorageOnline()
  if (offline) return offline
  const { searchParams } = new URL(request.url)
  const dl = searchParams.get('download')
  const download = dl === '1' || dl === 'true'

  let abs: string
  let total: number
  try {
    abs = resolveSafe(searchParams.get('path') ?? '')
    const stat = await fsp.stat(abs)
    if (!stat.isFile()) throw new FilesError('Not a file', 400)
    total = stat.size
  } catch (e) {
    return filesErrorResponse(e, 'content')
  }

  const mime = MIME[path.extname(abs).slice(1).toLowerCase()] ?? 'application/octet-stream'
  const active = ACTIVE.has(mime)
  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Content-Disposition': contentDisposition(download || active ? 'attachment' : 'inline', path.basename(abs)),
    'X-Content-Type-Options': 'nosniff',
  }
  if (active) headers['Content-Security-Policy'] = SANDBOX_CSP

  const range = parseRange(request.headers.get('range'), total)
  if (range === 'invalid') return rangeNotSatisfiable(total)

  const start = range ? range.start : 0
  const end = range ? range.end : total - 1
  // createReadStream with end < start (empty file) would read nothing anyway;
  // pass no bounds then so it does not throw.
  const nodeStream = total > 0 ? createReadStream(abs, { start, end }) : createReadStream(abs)
  const body = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>

  if (range) {
    headers['Content-Range'] = `bytes ${start}-${end}/${total}`
    headers['Content-Length'] = String(end - start + 1)
    return new Response(body, { status: 206, headers })
  }
  headers['Content-Length'] = String(total)
  return new Response(body, { status: 200, headers })
}
