import 'server-only'
import fs from 'fs'
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import sharp from 'sharp'
import exifReader from 'exif-reader'
import { FFPROBE, isSharpReadable, kindForExt, mimeForExt } from './config'
import type { PhotoKind } from './types'

const execFileAsync = promisify(execFile)

export interface MediaMeta {
  kind: PhotoKind
  mime: string
  /** Capture time (epoch ms) or null when the file carries none. */
  takenAt: number | null
  width: number | null
  height: number | null
  duration: number | null
  camera: string | null
  lat: number | null
  lon: number | null
}

// Plausible capture window: rejects 1904/1970 "zero" dates written by cameras without a clock.
const MIN_DATE = Date.UTC(1990, 0, 1)
function plausible(ms: number | null | undefined): number | null {
  if (ms == null || !Number.isFinite(ms)) return null
  return ms >= MIN_DATE && ms <= Date.now() + 86_400_000 ? ms : null
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/\u0000/g, '').trim()
  return s || null
}

function cameraName(make: string | null, model: string | null): string | null {
  if (!make) return model
  if (!model) return make
  return model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`
}

function validLatLon(lat: number | null, lon: number | null): [number | null, number | null] {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return [null, null]
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return [null, null]
  return [Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6]
}

// ── EXIF ─────────────────────────────────────────────────────────────────────

/**
 * exif-reader parses EXIF's zone-less "YYYY:MM:DD HH:MM:SS" as if it were UTC.
 * Re-interpret it with OffsetTimeOriginal when present, else as server-local time.
 */
function exifDate(d: unknown, offset: unknown, subsec: unknown): number | null {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null
  let ms: number
  const off = typeof offset === 'string' ? /^([+-])(\d{2}):?(\d{2})$/.exec(offset.trim()) : null
  if (off) {
    const mins = (Number(off[2]) * 60 + Number(off[3])) * (off[1] === '-' ? -1 : 1)
    ms = d.getTime() - mins * 60_000
  } else {
    ms = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
      d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime()
  }
  const sub = typeof subsec === 'string' && /^\d{1,9}$/.test(subsec.trim()) ? subsec.trim() : null
  if (sub) ms += Math.floor(Number(`0.${sub}`) * 1000)
  return ms
}

function gpsCoord(v: unknown, ref: unknown): number | null {
  if (!Array.isArray(v) || v.length === 0 || !v.every(n => typeof n === 'number' && Number.isFinite(n))) return null
  const [d, m = 0, s = 0] = v as number[]
  let dec = d + m / 60 + s / 3600
  if (typeof ref === 'string' && /^[SW]/i.test(ref.trim())) dec = -dec
  return dec
}

interface ExifFacts { takenAt: number | null; camera: string | null; lat: number | null; lon: number | null }

function readExif(buf: Buffer | undefined): ExifFacts {
  const none: ExifFacts = { takenAt: null, camera: null, lat: null, lon: null }
  if (!buf || buf.length < 8) return none
  let tags: ReturnType<typeof exifReader>
  try { tags = exifReader(buf) } catch { return none }
  const img = tags.Image ?? {}
  const photo = tags.Photo ?? {}
  const gps = tags.GPSInfo ?? {}
  const takenAt =
    plausible(exifDate(photo.DateTimeOriginal, photo.OffsetTimeOriginal, photo.SubSecTimeOriginal)) ??
    plausible(exifDate(photo.DateTimeDigitized, photo.OffsetTimeDigitized, photo.SubSecTimeDigitized)) ??
    plausible(exifDate(img.DateTime, photo.OffsetTime, photo.SubSecTime))
  const [lat, lon] = validLatLon(gpsCoord(gps.GPSLatitude, gps.GPSLatitudeRef), gpsCoord(gps.GPSLongitude, gps.GPSLongitudeRef))
  return { takenAt, camera: cameraName(str(img.Make), str(img.Model)), lat, lon }
}

// ── ffprobe ──────────────────────────────────────────────────────────────────

interface ProbeStream {
  codec_type?: string
  width?: number
  height?: number
  duration?: string
  tags?: Record<string, string>
  side_data_list?: { rotation?: number | string }[]
  disposition?: { attached_pic?: number }
}
interface ProbeGroup { type?: string; components?: { width?: number; height?: number }[] }
interface ProbeOutput {
  streams?: ProbeStream[]
  stream_groups?: ProbeGroup[]
  format?: { duration?: string; tags?: Record<string, string> }
}

export async function ffprobe(abs: string): Promise<ProbeOutput> {
  const { stdout } = await execFileAsync(FFPROBE, [
    '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', '-show_stream_groups', abs,
  ], { timeout: 20_000, maxBuffer: 16 * 1024 * 1024 })
  return JSON.parse(stdout) as ProbeOutput
}

function lowerTags(t: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(t ?? {})) out[k.toLowerCase()] = v
  return out
}

/** "+37.3349-122.0090+010.000/" → [lat, lon] */
function parseIso6709(s: string | undefined): [number | null, number | null] {
  const m = s ? /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(s.trim()) : null
  return m ? validLatLon(Number(m[1]), Number(m[2])) : [null, null]
}

function rotationOf(s: ProbeStream): number {
  for (const sd of s.side_data_list ?? []) {
    if (sd.rotation != null) return Number(sd.rotation) || 0
  }
  return Number(s.tags?.rotate ?? 0) || 0
}

interface ProbeFacts {
  takenAt: number | null; width: number | null; height: number | null
  duration: number | null; camera: string | null; lat: number | null; lon: number | null
}

function probeFacts(p: ProbeOutput): ProbeFacts {
  const v = p.streams?.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic)
  const ft = lowerTags(p.format?.tags)
  const st = lowerTags(v?.tags)
  // HEIF tile grids (iPhone photos) expose the full size on the stream group, not the tiles.
  const grid = p.stream_groups?.find(gp => gp.type === 'Tile Grid')?.components?.[0]
  let width = grid?.width ?? v?.width ?? null
  let height = grid?.height ?? v?.height ?? null
  if (v && Math.abs(rotationOf(v)) % 180 === 90) [width, height] = [height, width]
  const duration = Number(p.format?.duration ?? v?.duration)
  // Apple's creationdate carries the local offset; creation_time is UTC.
  const takenAt =
    plausible(Date.parse(ft['com.apple.quicktime.creationdate'] ?? '')) ??
    plausible(Date.parse(ft['creation_time'] ?? '')) ??
    plausible(Date.parse(st['creation_time'] ?? ''))
  const [lat, lon] = parseIso6709(ft['com.apple.quicktime.location.iso6709'] ?? ft['location'] ?? ft['location-eng'])
  return {
    takenAt,
    width: width || null,
    height: height || null,
    duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) / 1000 : null,
    camera: cameraName(str(ft['com.apple.quicktime.make'] ?? ft['make']), str(ft['com.apple.quicktime.model'] ?? ft['model'])),
    lat,
    lon,
  }
}

// ── Public ───────────────────────────────────────────────────────────────────

/** Read capture time, dimensions and camera/location for a supported file. Never throws for bad media. */
export async function extractMeta(abs: string, ext: string): Promise<MediaMeta> {
  const kind = kindForExt(ext)
  if (!kind) throw new Error(`Unsupported extension: ${ext}`)
  const base: MediaMeta = {
    kind, mime: mimeForExt(ext), takenAt: null, width: null, height: null,
    duration: null, camera: null, lat: null, lon: null,
  }

  if (kind === 'video') {
    try { return { ...base, ...probeFacts(await ffprobe(abs)) } } catch { return base }
  }

  // Images, HEIC included: sharp parses the HEIF container (dimensions + EXIF)
  // even though its prebuilt libvips cannot decode HEVC pixels.
  let out = base
  let sharpOk = false
  try {
    const m = await sharp(abs, { failOn: 'none' }).metadata()
    const w = m.width ?? null
    const h = (m.pages && m.pages > 1 ? m.pageHeight : m.height) ?? null
    const swap = (m.orientation ?? 1) >= 5
    out = { ...out, width: swap ? h : w, height: swap ? w : h, ...readExif(m.exif) }
    sharpOk = w != null
  } catch { /* fall through */ }

  if (!isSharpReadable(ext) && !sharpOk) {
    try {
      const f = probeFacts(await ffprobe(abs))
      out = {
        ...out,
        width: out.width ?? f.width, height: out.height ?? f.height,
        takenAt: out.takenAt ?? f.takenAt, camera: out.camera ?? f.camera,
        lat: out.lat ?? f.lat, lon: out.lon ?? f.lon,
      }
    } catch { /* leave what we have */ }
  }
  return out
}

// ── Cheap content hash ───────────────────────────────────────────────────────

const HEAD = 1024 * 1024
const TAIL = 64 * 1024

/** sha1 over size + first 1 MiB + last 64 KiB — enough to spot duplicates without reading whole videos. */
export async function cheapHash(abs: string, size: number): Promise<string> {
  const fh = await fs.promises.open(abs, 'r')
  try {
    const h = createHash('sha1').update(String(size))
    const head = Buffer.alloc(Math.min(HEAD, size))
    const { bytesRead } = await fh.read(head, 0, head.length, 0)
    h.update(head.subarray(0, bytesRead))
    if (size > HEAD) {
      const tailLen = Math.min(TAIL, size - HEAD)
      const tail = Buffer.alloc(tailLen)
      const r = await fh.read(tail, 0, tailLen, size - tailLen)
      h.update(tail.subarray(0, r.bytesRead))
    }
    return h.digest('hex')
  } finally {
    await fh.close()
  }
}
