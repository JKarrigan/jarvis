import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import { statSync } from 'fs'
import { resolveSafe } from '@/lib/files'

export const dynamic = 'force-dynamic'

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe'
const execFileAsync = promisify(execFile)

async function probeVideo(abs: string): Promise<{ durationSec: number; codec: string }> {
  try {
    const { stdout } = await execFileAsync(FFPROBE, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-select_streams', 'v:0',
      abs,
    ], { timeout: 8000 })
    const data = JSON.parse(stdout)
    const durationSec = parseFloat(data.format?.duration ?? '0')
    const codec = (data.streams?.[0]?.codec_name ?? '') as string
    return { durationSec, codec }
  } catch {
    return { durationSec: 0, codec: '' }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const relPath = searchParams.get('path') ?? ''
  const seekTo = parseFloat(searchParams.get('t') ?? '0') || 0

  let abs: string
  try { abs = resolveSafe(relPath) }
  catch { return new Response('Forbidden', { status: 403 }) }

  let inputSize: number
  try {
    const stat = statSync(abs)
    if (!stat.isFile()) return new Response('Not a file', { status: 400 })
    inputSize = stat.size
  } catch { return new Response('Not found', { status: 404 }) }

  const { durationSec, codec } = await probeVideo(abs)

  let ff: ReturnType<typeof spawn> | null = null

  const ffArgs = [
    ...(seekTo > 0 ? ['-ss', String(seekTo)] : []),
    '-i', abs,
    '-vcodec', 'copy',
    '-acodec', 'aac',
    '-b:a', '192k',
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    'pipe:1',
  ]

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ff = spawn(FFMPEG, ffArgs)
      ff.stdout!.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      ff.stdout!.on('end', () => controller.close())
      ff.stderr!.on('data', (chunk: Buffer) => { process.stderr.write(chunk) })
      ff.on('error', (err) => controller.error(err))
    },
    cancel() { ff?.kill('SIGKILL') },
  })

  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'no-store',
  }

  // Content-Length helps Chrome buffer aggressively on initial load (not used for seeks)
  if (seekTo === 0) headers['Content-Length'] = String(inputSize)
  if (durationSec > 0) headers['X-Duration-Seconds'] = String(durationSec)
  if (codec) headers['X-Video-Codec'] = codec

  return new Response(stream, { headers })
}
