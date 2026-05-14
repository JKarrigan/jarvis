import { spawn } from 'child_process'
import { statSync } from 'fs'
import { resolveSafe } from '@/lib/files'

export const dynamic = 'force-dynamic'

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const relPath = searchParams.get('path') ?? ''

  let abs: string
  try {
    abs = resolveSafe(relPath)
  } catch {
    return new Response('Forbidden', { status: 403 })
  }

  try {
    const stat = statSync(abs)
    if (!stat.isFile()) return new Response('Not a file', { status: 400 })
  } catch {
    return new Response('Not found', { status: 404 })
  }

  let ff: ReturnType<typeof spawn> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ff = spawn(FFMPEG, [
        '-i', abs,
        '-vcodec', 'copy',   // pass video through untouched — no re-encode cost
        '-acodec', 'aac',    // transcode audio only (handles AC3, DTS, TrueHD, etc.)
        '-b:a', '192k',
        '-f', 'mp4',
        // fragmented MP4: browser can start playing before the file is finished,
        // and no moov atom needs to be written at the end of the pipe
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        'pipe:1',
      ])

      ff.stdout!.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      ff.stdout!.on('end', () => controller.close())
      ff.on('error', (err) => controller.error(err))
      ff.stderr!.resume()
    },
    cancel() {
      ff?.kill('SIGKILL')
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'video/mp4',
      'Cache-Control': 'no-store',
    },
  })
}
