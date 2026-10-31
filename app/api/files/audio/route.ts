import fsp from 'fs/promises'
import { resolveSafe, filesErrorResponse, FilesError } from '@/lib/files'
import { INPUT_FLAGS, busyResponse, startTranscode, tryAcquireTranscode } from '../_lib/transcode'

export const dynamic = 'force-dynamic'

/**
 * GET ?path=<file> — the first audio stream transcoded to AAC in an ADTS
 * stream (streamable, no seek table). Chunked body; 503 + Retry-After when the
 * transcode slots are busy, 504 when ffmpeg produces nothing within 15 s.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  let abs: string
  try {
    abs = resolveSafe(searchParams.get('path') ?? '')
    if (!(await fsp.stat(abs)).isFile()) throw new FilesError('Not a file', 400)
  } catch (e) {
    return filesErrorResponse(e, 'audio')
  }

  const release = tryAcquireTranscode()
  if (!release) return busyResponse()

  const body = await startTranscode([
    ...INPUT_FLAGS,
    '-i', `file:${abs}`,
    '-map', '0:a:0',
    '-vn', '-sn', '-dn',
    '-c:a', 'aac',     // transcode to AAC (handles AC3, DTS, TrueHD, etc.)
    '-b:a', '192k',
    '-f', 'adts',      // ADTS: streamable AAC container, no seek table needed
    'pipe:1',
  ], request.signal, release, 'audio')
  if (body instanceof Response) return body

  return new Response(body, {
    headers: {
      'Content-Type': 'audio/aac',
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'none',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
