import { spawn, spawnSync } from 'child_process'
import { statSync, createReadStream, unlink } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { resolveSafe } from '@/lib/files'

export const dynamic = 'force-dynamic'

const FFMPEG  = process.env.FFMPEG_PATH  ?? 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe'

// How many bytes ffmpeg must write before we send the first response byte.
// Needs to be large enough that the moov box is fully on disk.
const STARTUP_BYTES = 256 * 1024
const POLL_MS = 150

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function diskSize(path: string): number {
  try { return statSync(path).size } catch { return 0 }
}

// Probe input file to estimate output size.
// ffprobe only reads container headers — no decoding, completes in <1 second.
function estimateOutputBytes(abs: string): number | null {
  try {
    const result = spawnSync(FFPROBE, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      abs,
    ])
    const info = JSON.parse(result.stdout.toString()) as {
      format: { duration?: string; bit_rate?: string }
      streams: { codec_type: string; bit_rate?: string }[]
    }

    const duration = parseFloat(info.format.duration ?? '0')
    if (!duration) return null

    const videoStream = info.streams.find(s => s.codec_type === 'video')
    // prefer per-stream bitrate; fall back to total format bitrate minus audio estimate
    const videoBps = parseInt(videoStream?.bit_rate ?? info.format.bit_rate ?? '0', 10)
    if (!videoBps) return null

    const audioBps = 192_000 // our fixed output audio bitrate
    return Math.round((videoBps + audioBps) * duration / 8)
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const relPath = searchParams.get('path') ?? ''

  let abs: string
  try { abs = resolveSafe(relPath) }
  catch { return new Response('Forbidden', { status: 403 }) }

  try { if (!statSync(abs).isFile()) return new Response('Not a file', { status: 400 }) }
  catch { return new Response('Not found', { status: 404 }) }

  const contentLength = estimateOutputBytes(abs)

  const tmpPath = join(tmpdir(), `ag-video-${randomUUID()}.mp4`)

  const ff = spawn(FFMPEG, [
    '-i', abs,
    '-vcodec', 'copy',  // video: pass through unchanged — no re-encode cost
    '-acodec', 'aac',   // audio: transcode to AAC (handles AC3, DTS, TrueHD, etc.)
    '-b:a', '192k',
    '-f', 'mp4',
    // Write to a real file so ffmpeg can put a proper moov (with duration) at the
    // start. Dropping empty_moov means Chrome reads the real duration immediately.
    '-movflags', 'frag_keyframe+default_base_moof',
    tmpPath,
  ])
  ff.stderr!.resume()

  let ffDone = false
  ff.on('close', () => { ffDone = true })

  let cleaned = false
  function cleanup() {
    if (cleaned) return
    cleaned = true
    try { ff.kill('SIGKILL') } catch {}
    setTimeout(() => unlink(tmpPath, () => {}), 500)
  }

  // Wait for ffmpeg to flush the moov box + first fragment before responding
  for (let ms = 0; ms < 15_000; ms += POLL_MS) {
    if (diskSize(tmpPath) >= STARTUP_BYTES || ffDone) break
    await sleep(POLL_MS)
  }

  // Parse Range header
  const rangeHeader = request.headers.get('range')
  let start = 0
  let reqEnd: number | undefined
  if (rangeHeader) {
    const m = rangeHeader.match(/bytes=(\d+)-(\d*)/)
    if (m) {
      start = parseInt(m[1], 10)
      if (m[2]) reqEnd = parseInt(m[2], 10)
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let pos = start
      try {
        while (true) {
          if (reqEnd !== undefined && pos > reqEnd) break

          const available = reqEnd !== undefined
            ? Math.min(reqEnd + 1, diskSize(tmpPath))
            : diskSize(tmpPath)

          if (pos < available) {
            const end = Math.min(pos + 256 * 1024 - 1, available - 1)
            const chunk = await new Promise<Uint8Array>((resolve, reject) => {
              const bufs: Buffer[] = []
              createReadStream(tmpPath, { start: pos, end })
                .on('data', c => bufs.push(c as Buffer))
                .on('end', () => resolve(new Uint8Array(Buffer.concat(bufs))))
                .on('error', reject)
            })
            controller.enqueue(chunk)
            pos += chunk.length
          } else if (ffDone) {
            break
          } else {
            await sleep(POLL_MS)
          }
        }
      } catch { /* client disconnected */ }

      controller.close()
      cleanup()
    },
    cancel: cleanup,
  })

  const end = reqEnd ?? (contentLength ? contentLength - 1 : diskSize(tmpPath) - 1)
  const total = contentLength ?? '*'

  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  }

  if (contentLength && !rangeHeader) {
    headers['Content-Length'] = String(contentLength)
  }

  if (rangeHeader) {
    headers['Content-Range'] = `bytes ${start}-${end}/${total}`
    if (contentLength) headers['Content-Length'] = String(end - start + 1)
  }

  return new Response(stream, {
    status: rangeHeader ? 206 : 200,
    headers,
  })
}
