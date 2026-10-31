import 'server-only'
import { spawn, type ChildProcessByStdio } from 'child_process'
import type { Readable } from 'stream'
import { intParam } from '@/lib/http'

export const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg'
export const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe'

/** Flags every ffprobe call gets: quiet logs, and no network/playlist fetches. */
export const PROBE_FLAGS = ['-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,pipe']
/** Flags every ffmpeg input gets (before -i): as PROBE_FLAGS, plus no progress stats. */
export const INPUT_FLAGS = ['-nostats', ...PROBE_FLAGS]

const MAX_TRANSCODES = intParam(process.env.MAX_TRANSCODES, { def: 2, min: 1, max: 8 })
const FIRST_BYTE_TIMEOUT_MS = 15_000
const STDERR_TAIL_BYTES = 4096

// Shared across route bundles and hot reloads.
const g = globalThis as typeof globalThis & { __ag_transcodes?: { active: number } }
function slots() {
  return (g.__ag_transcodes ??= { active: 0 })
}

/** Takes one of the MAX_TRANSCODES slots; returns its idempotent release, or null when all are busy. */
export function tryAcquireTranscode(): (() => void) | null {
  const s = slots()
  if (s.active >= MAX_TRANSCODES) return null
  s.active++
  let released = false
  return () => {
    if (released) return
    released = true
    s.active--
  }
}

export function busyResponse(): Response {
  return new Response('Too many streams in progress — try again shortly', {
    status: 503,
    headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' },
  })
}

type Ff = ChildProcessByStdio<null, Readable, Readable>

/**
 * Spawns ffmpeg and waits for its first output chunk (up to 15 s). Resolves to
 * a pull-based web stream — ffmpeg is only read as fast as the client consumes,
 * so a paused player blocks ffmpeg instead of buffering the remux in RAM — or
 * to an error Response when ffmpeg fails or produces nothing in time.
 *
 * The process is killed when the request aborts or the body is cancelled; the
 * transcode slot is released when the process has actually exited.
 */
export async function startTranscode(
  args: string[],
  signal: AbortSignal,
  release: () => void,
  label: string,
): Promise<ReadableStream<Uint8Array> | Response> {
  let ff: Ff
  try {
    ff = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    release()
    console.error(`[${label}] could not start ffmpeg:`, e)
    return new Response('Transcode failed', { status: 500 })
  }

  // Keep only a bounded tail of ffmpeg's (error-level) log for diagnostics.
  let stderrTail = ''
  ff.stderr.setEncoding('utf8')
  ff.stderr.on('data', (s: string) => {
    stderrTail = (stderrTail + s).slice(-STDERR_TAIL_BYTES)
  })

  let killedByUs = false
  const kill = () => {
    killedByUs = true
    if (ff.exitCode === null && ff.signalCode === null) ff.kill('SIGKILL')
  }
  const exited = new Promise<number | null>(resolve => {
    ff.once('close', code => resolve(code))
    ff.once('error', err => {
      console.error(`[${label}] ffmpeg error:`, err)
      resolve(-1)
    })
  }).then(code => {
    release()
    signal.removeEventListener('abort', kill)
    if (code !== 0 && !killedByUs) {
      console.error(`[${label}] ffmpeg exited with code ${code}${stderrTail ? `: ${stderrTail.trim()}` : ''}`)
    }
    return code
  })
  if (signal.aborted) kill()
  else signal.addEventListener('abort', kill, { once: true })

  const it = ff.stdout[Symbol.asyncIterator]() as AsyncIterator<Buffer>

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), FIRST_BYTE_TIMEOUT_MS) })
  let first: IteratorResult<Buffer> | 'timeout'
  try {
    first = await Promise.race([it.next(), timeout])
  } catch {
    first = { done: true, value: undefined }
  } finally {
    clearTimeout(timer)
  }

  if (first === 'timeout') {
    console.error(`[${label}] ffmpeg produced no output within ${FIRST_BYTE_TIMEOUT_MS / 1000} s`)
    kill()
    return new Response('Transcode timed out', { status: 504 })
  }
  if (first.done) {
    kill()
    await exited
    return new Response(signal.aborted ? null : 'Transcode failed', { status: signal.aborted ? 499 : 500 })
  }

  let pending: Buffer | null = first.value
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (pending) {
        controller.enqueue(new Uint8Array(pending))
        pending = null
        return
      }
      let r: IteratorResult<Buffer>
      try {
        r = await it.next()
      } catch (e) {
        kill()
        controller.error(e)
        return
      }
      if (!r.done) {
        controller.enqueue(new Uint8Array(r.value))
        return
      }
      // A non-zero exit mid-stream means truncated output: surface it as an
      // error so the client does not treat it as a clean end of file.
      const code = await exited
      if (code !== 0 && !killedByUs) controller.error(new Error(`ffmpeg exited with code ${code}`))
      else controller.close()
    },
    cancel() {
      kill()
      void it.return?.()
    },
  })
}
