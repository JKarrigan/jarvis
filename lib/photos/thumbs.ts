import 'server-only'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import sharp, { type Sharp } from 'sharp'
import { FFMPEG, cacheDirFor, ensureCacheDir, extOf, isSharpReadable, photoAbs } from './config'
import { getPhotoRow, MISSING_PREFIX, type PhotoRow } from './db'
import type { ThumbSize } from './types'

// ── Work queue: at most 2 concurrent sharp/ffmpeg jobs per process ────────────

type Job = () => void
interface QueueState { active: number; high: Job[]; low: Job[]; inflight: Map<string, Promise<string>> }
const MAX_ACTIVE = 2
const g = globalThis as typeof globalThis & { __photos_queue?: QueueState }
const q: QueueState = (g.__photos_queue ??= { active: 0, high: [], low: [], inflight: new Map() })

function pump(): void {
  while (q.active < MAX_ACTIVE) {
    const job = q.high.shift() ?? q.low.shift()
    if (!job) return
    q.active++
    job()
  }
}

/**
 * Run `fn` when a slot is free. `high` jobs (user requests) jump ahead of `low`
 * ones (scan metadata, background thumbnail fill).
 */
export function runLimited<T>(fn: () => Promise<T>, priority: 'high' | 'low' = 'high'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const job: Job = () => {
      fn().then(resolve, reject).finally(() => { q.active--; pump() })
    }
    ;(priority === 'high' ? q.high : q.low).push(job)
    pump()
  })
}

export function queueDepth(): number {
  return q.active + q.high.length + q.low.length
}

// ── Derivation ───────────────────────────────────────────────────────────────

const T_EDGE = 400
const P_EDGE = 1600
const FF_TIMEOUT = 60_000
const FF_MAX_BUFFER = 128 * 1024 * 1024

export class DerivedError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

function ffmpegFrame(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, args, { encoding: 'buffer', timeout: FF_TIMEOUT, maxBuffer: FF_MAX_BUFFER, killSignal: 'SIGKILL' },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`ffmpeg failed: ${stderr.toString('utf8').trim().slice(-300) || err.message}`))
        if (!stdout.length) return reject(new Error('ffmpeg produced no frame'))
        resolve(stdout)
      })
  })
}

// Downscale inside ffmpeg (never upscale) so the PNG pipe stays small on a Pi.
const FRAME_SCALE = `scale=w='min(${P_EDGE},iw)':h='min(${P_EDGE},ih)':force_original_aspect_ratio=decrease`

// HEIF tile grids are assembled by an internal complex filtergraph in ffmpeg ≥ 7.1, which
// cannot be combined with -vf; those frames are resized by sharp instead.
function frameArgs(abs: string, seek: number | null, scale: boolean): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    ...(seek != null ? ['-ss', String(seek)] : []),
    '-i', abs, '-frames:v', '1', ...(scale ? ['-vf', FRAME_SCALE] : []),
    '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1',
  ]
}

async function videoFrame(abs: string, duration: number | null): Promise<Buffer> {
  if (duration != null && duration < 1) return ffmpegFrame(frameArgs(abs, 0, true))
  try {
    return await ffmpegFrame(frameArgs(abs, 1, true))
  } catch {
    // Shorter than 1 s (or unknown duration): seeking past the end yields nothing.
    return ffmpegFrame(frameArgs(abs, 0, true))
  }
}

async function writeWebp(input: Sharp, edge: number, quality: number, dest: string): Promise<void> {
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`
  try {
    await input
      .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 3 })
      .toFile(tmp)
    await fs.promises.rename(tmp, dest)
  } catch (e) {
    await fs.promises.rm(tmp, { force: true })
    throw e
  }
}

const exists = (p: string) => fs.promises.access(p).then(() => true, () => false)

async function generate(row: PhotoRow, size: ThumbSize): Promise<void> {
  const abs = photoAbs(row.rel_path)
  const dir = cacheDirFor(row.id)
  await fs.promises.mkdir(dir, { recursive: true })
  const tPath = path.join(dir, 't.webp')
  const pPath = path.join(dir, 'p.webp')
  const ext = extOf(row.rel_path)

  if (row.kind === 'video') {
    const poster = path.join(dir, 'poster.webp')
    if (!(await exists(poster))) {
      const frame = await videoFrame(abs, row.duration)
      await writeWebp(sharp(frame), P_EDGE, 80, poster)
    }
    if (size === 't' && !(await exists(tPath))) await writeWebp(sharp(poster), T_EDGE, 70, tPath)
    return
  }

  if (isSharpReadable(ext)) {
    // animated: false → first frame only for GIF/WebP; rotate() applies EXIF orientation.
    const src = () => sharp(abs, { failOn: 'none', animated: false, limitInputPixels: 268_402_689 }).rotate()
    if (size === 'p') await writeWebp(src(), P_EDGE, 82, pPath)
    // Prefer the preview as the source of the tile when it already exists (much cheaper).
    else await writeWebp((await exists(pPath)) ? sharp(pPath) : src(), T_EDGE, 70, tPath)
    return
  }

  // HEIC/HEIF: one ffmpeg decode produces both sizes.
  const frame = await ffmpegFrame(frameArgs(abs, null, false))
  if (!(await exists(pPath))) await writeWebp(sharp(frame), P_EDGE, 82, pPath)
  if (!(await exists(tPath))) await writeWebp(sharp(frame), T_EDGE, 70, tPath)
}

function derivedPath(row: PhotoRow, size: ThumbSize): string {
  const dir = cacheDirFor(row.id)
  // Videos: the poster is the preview.
  if (size === 'p' && row.kind === 'video') return path.join(dir, 'poster.webp')
  return path.join(dir, size === 't' ? 't.webp' : 'p.webp')
}

const FAIL_MARK = 'failed'

/**
 * Path of the cached derived image, generating it (through the queue) if needed.
 * Throws DerivedError(404) for unknown/missing items and (422) for undecodable media.
 */
export async function getDerived(id: string, size: ThumbSize, priority: 'high' | 'low' = 'high'): Promise<string> {
  const row = getPhotoRow(id)
  if (!row || row.rel_path.startsWith(MISSING_PREFIX)) throw new DerivedError('Not found', 404)
  ensureCacheDir()
  const out = derivedPath(row, size)
  if (await exists(out)) return out

  // A previous attempt on this exact file version failed: don't burn CPU again.
  const failMark = path.join(cacheDirFor(id), FAIL_MARK)
  try {
    const st = await fs.promises.stat(failMark)
    if (st.mtimeMs >= row.mtime) throw new DerivedError('Media could not be decoded', 422)
  } catch (e) { if (e instanceof DerivedError) throw e }

  const key = `${id}:${size}`
  let p = q.inflight.get(key)
  if (!p) {
    p = runLimited(async () => {
      if (!(await exists(out))) await generate(row, size)
      return out
    }, priority).catch(async (e: unknown) => {
      // Unreadable original (share offline, file gone): transient, never mark as failed.
      let readable = false
      try { readable = (await fs.promises.stat(photoAbs(row.rel_path))).isFile() } catch { /* offline */ }
      if (!readable) throw new DerivedError('Original not available', 503)
      await fs.promises.mkdir(cacheDirFor(id), { recursive: true }).catch(() => {})
      await fs.promises.writeFile(failMark, String(e instanceof Error ? e.message : e)).catch(() => {})
      throw new DerivedError('Media could not be decoded', 422)
    }).finally(() => { q.inflight.delete(key) })
    q.inflight.set(key, p)
  }
  return p
}

/** True when the grid tile exists or generation already failed for this file version. */
export async function hasThumbOrFailed(id: string, mtime: number): Promise<boolean> {
  const dir = cacheDirFor(id)
  if (await exists(path.join(dir, 't.webp'))) return true
  try { return (await fs.promises.stat(path.join(dir, FAIL_MARK))).mtimeMs >= mtime } catch { return false }
}

/** Drop derived files (original changed or was deleted). */
export async function clearDerived(id: string): Promise<void> {
  await fs.promises.rm(cacheDirFor(id), { recursive: true, force: true })
}
