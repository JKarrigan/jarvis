import { execFile } from 'child_process'
import { promisify } from 'util'
import fsp from 'fs/promises'
import { numParam } from '@/lib/http'
import { resolveSafe, filesErrorResponse, FilesError } from '@/lib/files'
import { FFPROBE, INPUT_FLAGS, PROBE_FLAGS, busyResponse, startTranscode, tryAcquireTranscode } from '../_lib/transcode'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

type Probe = { durationSec: number; codec: string; hasAudio: boolean }

async function probeVideo(abs: string): Promise<Probe> {
  try {
    const { stdout } = await execFileAsync(FFPROBE, [
      ...PROBE_FLAGS,
      '-print_format', 'json',
      '-show_entries', 'format=duration:stream=codec_type,codec_name',
      `file:${abs}`,
    ], { timeout: 8000, maxBuffer: 1024 * 1024 })
    const data = JSON.parse(stdout) as {
      format?: { duration?: string }
      streams?: { codec_type?: string; codec_name?: string }[]
    }
    const streams = data.streams ?? []
    const durationSec = parseFloat(data.format?.duration ?? '0') || 0
    const codec = streams.find(s => s.codec_type === 'video')?.codec_name ?? ''
    // Unknown (probe failed) is treated as "has audio" so the old behaviour holds.
    const hasAudio = streams.length === 0 || streams.some(s => s.codec_type === 'audio')
    return { durationSec, codec, hasAudio }
  } catch {
    return { durationSec: 0, codec: '', hasAudio: true }
  }
}

/**
 * GET ?path=<file>[&t=<seconds>] — remuxes the first video stream (copied) and
 * the first audio stream (AAC) into fragmented MP4 for MSE playback.
 *
 * Response contract (VideoPlayer.tsx): chunked body (no Content-Length — the
 * remux size is unknown), `Accept-Ranges: none`, `X-Duration-Seconds`,
 * `X-Video-Codec`, `X-Has-Audio: 0|1`. 503 + Retry-After when the transcode
 * slots are busy, 504 when ffmpeg produces nothing within 15 s.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const seekTo = numParam(searchParams.get('t'), 0, 7 * 24 * 3600) ?? 0

  let abs: string
  try {
    abs = resolveSafe(searchParams.get('path') ?? '')
    if (!(await fsp.stat(abs)).isFile()) throw new FilesError('Not a file', 400)
  } catch (e) {
    return filesErrorResponse(e, 'video')
  }

  const release = tryAcquireTranscode()
  if (!release) return busyResponse()

  const { durationSec, codec, hasAudio } = await probeVideo(abs)
  if (request.signal.aborted) { release(); return new Response(null, { status: 499 }) }

  const ffArgs = [
    ...INPUT_FLAGS,
    ...(seekTo > 0 ? ['-ss', String(seekTo)] : []),
    '-i', `file:${abs}`,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-sn', '-dn',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    // -copyts preserves original PTS values from the input so MSE can place
    // seek-stream fragments at the correct timeline position (e.g. t=3600 not t=0)
    '-copyts',
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    'pipe:1',
  ]

  const body = await startTranscode(ffArgs, request.signal, release, 'video')
  if (body instanceof Response) return body

  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'none',
    'X-Content-Type-Options': 'nosniff',
    'X-Has-Audio': hasAudio ? '1' : '0',
  }
  if (durationSec > 0) headers['X-Duration-Seconds'] = String(durationSec)
  if (codec) headers['X-Video-Codec'] = codec

  return new Response(body, { headers })
}
