import fs from 'fs'
import { spawn, type ChildProcessByStdio } from 'child_process'
import type { Readable } from 'stream'
import { FFMPEG, photoAbs } from '@/lib/photos/config'
import { getPhotoRow, MISSING_PREFIX } from '@/lib/photos/db'
import { isId, jsonError } from '@/lib/photos/http'

export const dynamic = 'force-dynamic'

/** Live transcodes are expensive on a Pi: refuse beyond this many at once. */
const MAX_TRANSCODES = 2
const FIRST_BYTE_TIMEOUT_MS = 20_000

const g = globalThis as typeof globalThis & { __photos_transcodes?: { active: number } }
const slots = (g.__photos_transcodes ??= { active: 0 })

// Landscape → 720 px tall, portrait → 720 px wide; never upscale; even dimensions for yuv420p.
const SCALE = "scale=w='if(gte(iw,ih),-2,min(720,iw))':h='if(gte(iw,ih),min(720,ih),-2)'"

// GET /api/photos/[id]/stream?t=<seconds> — H.264/AAC 720p fragmented MP4 for videos the
// browser cannot play natively (e.g. HEVC .mov in Chrome). ffmpeg dies with the request.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isId(id)) return jsonError(400, 'Invalid id')
  const row = getPhotoRow(id)
  if (!row || row.rel_path.startsWith(MISSING_PREFIX)) return jsonError(404, 'Not found')
  if (row.kind !== 'video') return jsonError(400, 'Not a video')

  const tRaw = new URL(request.url).searchParams.get('t')
  let seek = 0
  if (tRaw) {
    if (!/^\d{1,6}(\.\d{1,3})?$/.test(tRaw)) return jsonError(400, 'Invalid t')
    seek = Number(tRaw)
    if (row.duration != null && seek >= row.duration) return jsonError(416, 't is past the end')
  }

  const abs = photoAbs(row.rel_path)
  try {
    await fs.promises.access(abs, fs.constants.R_OK)
  } catch {
    return jsonError(503, 'Original not available', { 'Retry-After': '30' })
  }

  if (slots.active >= MAX_TRANSCODES) return jsonError(503, 'Too many transcodes', { 'Retry-After': '5' })
  slots.active++

  const args = [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    ...(seek > 0 ? ['-ss', String(seek)] : []),
    '-i', abs,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', SCALE,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4', 'pipe:1',
  ]

  let ff: ChildProcessByStdio<null, Readable, Readable> | null = null
  let released = false
  let settled = false
  let gotData = false
  let stderrTail = ''
  let timer: ReturnType<typeof setTimeout> | null = null

  const release = () => {
    if (timer) { clearTimeout(timer); timer = null }
    if (!released) { released = true; slots.active-- }
  }
  const kill = () => {
    if (ff && ff.exitCode === null && ff.signalCode === null) ff.kill('SIGKILL')
    release()
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const fail = (err: Error) => {
        if (settled) return
        settled = true
        kill()
        controller.error(err)
      }
      const done = () => {
        if (settled) return
        settled = true
        release()
        controller.close()
      }

      try {
        ff = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (e) {
        fail(e as Error)
        return
      }
      const proc = ff

      timer = setTimeout(() => { if (!gotData) fail(new Error('ffmpeg produced no output')) }, FIRST_BYTE_TIMEOUT_MS)

      proc.stdout.on('data', (chunk: Buffer) => {
        if (settled) return
        if (!gotData) { gotData = true; if (timer) { clearTimeout(timer); timer = null } }
        controller.enqueue(new Uint8Array(chunk))
        // Backpressure: stop reading ffmpeg while the client is behind.
        if ((controller.desiredSize ?? 1) <= 0) proc.stdout.pause()
      })
      proc.stderr.on('data', (chunk: Buffer) => { stderrTail = (stderrTail + chunk.toString('utf8')).slice(-1000) })
      proc.on('error', fail)
      proc.on('close', (code) => {
        if (code === 0 || (gotData && code === null)) done()
        else if (!gotData) fail(new Error(`ffmpeg exited with ${code}: ${stderrTail.trim()}`))
        else done() // truncated output after data started; close what we sent
      })
    },
    pull() {
      if (ff && ff.stdout.isPaused()) ff.stdout.resume()
    },
    cancel() {
      settled = true
      kill()
    },
  }, { highWaterMark: 8 })

  request.signal.addEventListener('abort', () => { settled = true; kill() }, { once: true })

  return new Response(stream, {
    headers: {
      'Content-Type': 'video/mp4',
      'Cache-Control': 'no-store',
      ...(row.duration != null ? { 'X-Duration-Seconds': String(row.duration) } : {}),
    },
  })
}
