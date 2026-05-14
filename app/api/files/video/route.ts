import { spawn } from 'child_process'
import { statSync, createReadStream, unlink } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { resolveSafe } from '@/lib/files'

export const dynamic = 'force-dynamic'

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg'
const STARTUP_BYTES = 256 * 1024 // wait for 256 KB (moov + first fragment) before serving
const POLL_MS = 150

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function diskSize(path: string): number {
  try { return statSync(path).size } catch { return 0 }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const relPath = searchParams.get('path') ?? ''

  let abs: string
  try { abs = resolveSafe(relPath) }
  catch { return new Response('Forbidden', { status: 403 }) }

  try { if (!statSync(abs).isFile()) return new Response('Not a file', { status: 400 }) }
  catch { return new Response('Not found', { status: 404 }) }

  // Write to a temp file instead of piping to stdout.
  // This lets ffmpeg write a proper moov box (with duration) at the start,
  // and lets us serve range requests so Chrome buffers aggressively.
  const tmpPath = join(tmpdir(), `ag-video-${randomUUID()}.mp4`)

  const ff = spawn(FFMPEG, [
    '-i', abs,
    '-vcodec', 'copy',  // video: pass through unchanged
    '-acodec', 'aac',   // audio: transcode (handles AC3, DTS, TrueHD, etc.)
    '-b:a', '192k',
    '-f', 'mp4',
    // frag_keyframe+default_base_moof WITHOUT empty_moov:
    // ffmpeg writes a real moov with correct duration at the start of the file,
    // then appends keyframe-aligned fragments. Chrome reads duration from moov immediately.
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

  // Wait for ffmpeg to flush the moov box + at least one fragment to disk
  for (let ms = 0; ms < 15_000; ms += POLL_MS) {
    if (diskSize(tmpPath) >= STARTUP_BYTES || ffDone) break
    await sleep(POLL_MS)
  }

  // Parse Range header (browser sends this when seeking or rebuffering)
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
            // ffmpeg still writing — wait for more data
            await sleep(POLL_MS)
          }
        }
      } catch { /* client disconnected */ }

      controller.close()
      cleanup()
    },
    cancel: cleanup,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  }

  if (rangeHeader) {
    // Total size is unknown while ffmpeg is running, so use * for the total field.
    // Chrome handles this and will use the duration from the moov box instead.
    const end = reqEnd ?? diskSize(tmpPath) - 1
    headers['Content-Range'] = `bytes ${start}-${end}/*`
  }

  return new Response(stream, {
    status: rangeHeader ? 206 : 200,
    headers,
  })
}
