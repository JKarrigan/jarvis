import 'server-only'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import sharp, { type Sharp } from 'sharp'
import { FFMPEG, FFPROBE, cacheDirFor, ensureCacheDir, extOf, isSharpReadable, photoAbs } from './config'
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

// ── HEIC / HEIF ──────────────────────────────────────────────────────────────
//
// iPhone HEIC files hold the picture as a grid of 512×512 HEVC tiles plus
// auxiliary images (depth map, portrait matte). ffmpeg's HEIF demuxer exposes the
// grid as a "Tile Grid" stream group; ffmpeg 7.x does not assemble it on its own
// (`-map 0:g:0` or default selection yields one tile, or the matte), so we read
// the grid geometry with ffprobe and stitch the tiles ourselves with
// concat → tile → crop. Non-grid HEIFs decode as a plain single stream.

interface TileGrid {
  streams: number[]       // tile stream indexes in raster order
  cols: number
  rows: number
  width: number           // final (cropped) size
  height: number
  hOff: number
  vOff: number
}

interface ProbeGroups {
  stream_groups?: {
    type?: string
    components?: {
      nb_tiles?: number; coded_width?: number; coded_height?: number
      horizontal_offset?: number; vertical_offset?: number; width?: number; height?: number
      subcomponents?: { stream_index: number; tile_horizontal_offset: number; tile_vertical_offset: number }[]
    }[]
  }[]
  streams?: { index: number; width?: number; height?: number }[]
}

function ffprobeJson(args: string[]): Promise<ProbeGroups> {
  return new Promise((resolve, reject) => {
    execFile(FFPROBE, ['-v', 'error', '-of', 'json', ...args], { timeout: FF_TIMEOUT, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err)
        try { resolve(JSON.parse(String(stdout)) as ProbeGroups) } catch (e) { reject(e) }
      })
  })
}

/** The primary tile grid of a HEIF, or null when the file is a plain single image. */
async function heifTileGrid(abs: string): Promise<TileGrid | null> {
  const probe = await ffprobeJson(['-show_stream_groups', '-show_streams', abs])
  const grid = probe.stream_groups?.find(g => g.type === 'Tile Grid')
  const c = grid?.components?.[0]
  if (!c?.subcomponents?.length || !c.coded_width || !c.coded_height || !c.width || !c.height) return null
  const tiles = [...c.subcomponents].sort((a, b) =>
    a.tile_vertical_offset - b.tile_vertical_offset || a.tile_horizontal_offset - b.tile_horizontal_offset)
  const first = probe.streams?.find(st => st.index === tiles[0].stream_index)
  const tileW = first?.width ?? 0
  const tileH = first?.height ?? 0
  if (!tileW || !tileH) return null
  const cols = Math.round(c.coded_width / tileW)
  const rows = Math.round(c.coded_height / tileH)
  if (cols * rows !== tiles.length) return null
  return {
    streams: tiles.map(t => t.stream_index), cols, rows,
    width: c.width, height: c.height, hOff: c.horizontal_offset ?? 0, vOff: c.vertical_offset ?? 0,
  }
}

/** Decode a HEIF to one PNG frame (long edge ≤ P_EDGE), stitching tile grids. */
async function heifFrame(abs: string): Promise<Buffer> {
  let grid: TileGrid | null = null
  try { grid = await heifTileGrid(abs) } catch { /* fall through to single-stream decode */ }
  if (!grid) {
    // Plain HEIF: the primary picture is the first (and usually only) video stream.
    return ffmpegFrame([
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', abs, '-map', '0:v:0',
      '-frames:v', '1', '-vf', FRAME_SCALE, '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1',
    ])
  }
  const inputs = grid.streams.map(i => `[0:${i}]`).join('')
  const filter = `${inputs}concat=n=${grid.streams.length}:v=1:a=0,` +
    `tile=${grid.cols}x${grid.rows},crop=${grid.width}:${grid.height}:${grid.hOff}:${grid.vOff},${FRAME_SCALE}`
  return ffmpegFrame([
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', abs,
    '-filter_complex', filter, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1',
  ])
}

/** Apply an EXIF orientation (1–8) to a decoded frame, when sharp reports one. */
function orient(img: Sharp, orientation: number | undefined): Sharp {
  switch (orientation) {
    case 2: return img.flop()
    case 3: return img.rotate(180)
    case 4: return img.flip()
    case 5: return img.rotate(90).flop()
    case 6: return img.rotate(90)
    case 7: return img.rotate(270).flop()
    case 8: return img.rotate(270)
    default: return img
  }
}

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

  // HEIC/HEIF: one stitched ffmpeg decode produces both sizes. sharp can read the
  // container's EXIF (not its pixels), which gives us the orientation to apply.
  let orientation: number | undefined
  try { orientation = (await sharp(abs).metadata()).orientation } catch { /* no EXIF */ }
  const frame = await heifFrame(abs)
  if (!(await exists(pPath))) await writeWebp(orient(sharp(frame), orientation), P_EDGE, 82, pPath)
  if (!(await exists(tPath))) await writeWebp(orient(sharp(frame), orientation), T_EDGE, 70, tPath)
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
