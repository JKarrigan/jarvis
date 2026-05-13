import { createReadStream, statSync } from 'fs'
import { Readable } from 'stream'
import path from 'path'
import { resolveSafe } from '@/lib/files'

export const dynamic = 'force-dynamic'

function mimeFor(ext: string): string {
  const map: Record<string, string> = {
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
  return map[ext.toLowerCase()] ?? 'application/octet-stream'
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const relPath = searchParams.get('path') ?? ''
  const download = searchParams.get('download') === 'true'

  let abs: string
  try {
    abs = resolveSafe(relPath)
  } catch {
    return new Response('Forbidden', { status: 403 })
  }

  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(abs)
  } catch {
    return new Response('Not Found', { status: 404 })
  }

  if (!stat.isFile()) {
    return new Response('Not a file', { status: 400 })
  }

  const total = stat.size
  const ext = path.extname(abs).slice(1)
  const mime = mimeFor(ext)
  const filename = path.basename(abs)
  const encodedFilename = encodeURIComponent(filename)
  const disposition = download
    ? `attachment; filename="${encodedFilename}"`
    : `inline; filename="${encodedFilename}"`

  const rangeHeader = request.headers.get('range')

  if (rangeHeader) {
    const [, rangeVal] = rangeHeader.split('=')
    const [startStr, endStr] = rangeVal.split('-')
    const start = parseInt(startStr, 10)
    const end = endStr ? parseInt(endStr, 10) : total - 1
    const chunkSize = end - start + 1

    const nodeStream = createReadStream(abs, { start, end })
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>

    return new Response(webStream, {
      status: 206,
      headers: {
        'Content-Type': mime,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Disposition': disposition,
      },
    })
  }

  const nodeStream = createReadStream(abs)
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>

  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(total),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': disposition,
    },
  })
}
