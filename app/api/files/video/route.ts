import { spawn } from 'child_process'
import { statSync } from 'fs'
import { resolveSafe } from '@/lib/files'

export const dynamic = 'force-dynamic'

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const relPath = searchParams.get('path') ?? ''

  let abs: string
  try { abs = resolveSafe(relPath) }
  catch { return new Response('Forbidden', { status: 403 }) }

  let inputSize: number
  try {
    const stat = statSync(abs)
    if (!stat.isFile()) return new Response('Not a file', { status: 400 })
    inputSize = stat.size
  } catch { return new Response('Not found', { status: 404 }) }

  let ff: ReturnType<typeof spawn> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ff = spawn(FFMPEG, [
        '-i', abs,
        '-vcodec', 'copy',
        '-acodec', 'aac',
        '-b:a', '192k',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        'pipe:1',
      ])

      ff.stdout!.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      ff.stdout!.on('end', () => controller.close())
      ff.stderr!.on('data', (chunk: Buffer) => {
        // log ffmpeg errors to server console so failures are visible
        process.stderr.write(chunk)
      })
      ff.on('error', (err) => controller.error(err))
    },
    cancel() {
      ff?.kill('SIGKILL')
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'video/mp4',
      // Input size is a close estimate — video stream is copied byte-for-byte,
      // only audio changes (typically <5% of a 4K file). Chrome needs a
      // Content-Length to buffer aggressively instead of treating this as a live stream.
      'Content-Length': String(inputSize),
      'Cache-Control': 'no-store',
    },
  })
}
