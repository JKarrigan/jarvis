import 'server-only'
import fs from 'fs'
import path from 'path'
import { FILES_ROOT } from '@/lib/files'
import { PHOTO_IMAGE_EXTS, PHOTO_VIDEO_EXTS, type PhotoKind } from './types'

/** The photo library (on the Pi: a mounted NAS share). */
export const PHOTOS_ROOT = path.resolve(process.env.PHOTOS_ROOT ?? path.join(FILES_ROOT, 'Photos'))
/** Derived files on local disk. Disposable. */
export const PHOTOS_CACHE = path.resolve(process.env.PHOTOS_CACHE ?? path.join(process.cwd(), '.photos-cache'))
/** Trashed originals keep their relative path under here so restore knows where they came from. */
export const TRASH_DIR = '.trash'
/** In-flight uploads; inside PHOTOS_ROOT so the final rename stays on the same filesystem. */
export const UPLOAD_TMP_DIR = '.uploading'
/** Mount-guard marker written on the first successful scan. */
export const LIBRARY_MARKER = '.photos-library'
/** NAS-side catalog of favorites + albums. */
export const CATALOG_REL = '.library/catalog.json'

export const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg'
export const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe'

const IMAGE_SET = new Set<string>(PHOTO_IMAGE_EXTS)
const VIDEO_SET = new Set<string>(PHOTO_VIDEO_EXTS)

export function extOf(name: string): string {
  return path.extname(name).slice(1).toLowerCase()
}

export function kindForExt(ext: string): PhotoKind | null {
  if (IMAGE_SET.has(ext)) return 'image'
  if (VIDEO_SET.has(ext)) return 'video'
  return null
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', heic: 'image/heic', heif: 'image/heif', tiff: 'image/tiff',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm', mkv: 'video/x-matroska',
}

export function mimeForExt(ext: string): string {
  return MIME[ext] ?? 'application/octet-stream'
}

/** Formats sharp's prebuilt libvips can decode (HEIC/HEIF need ffmpeg). */
export function isSharpReadable(ext: string): boolean {
  return IMAGE_SET.has(ext) && ext !== 'heic' && ext !== 'heif'
}

/**
 * Resolve a library-relative path to an absolute one, refusing anything that
 * escapes PHOTOS_ROOT. Paths always come from the DB, but stay defensive.
 */
export function photoAbs(relPath: string): string {
  if (!relPath || relPath.includes('\0')) throw new Error('Invalid path')
  const abs = path.resolve(PHOTOS_ROOT, relPath)
  if (!abs.startsWith(PHOTOS_ROOT + path.sep)) throw new Error('Path traversal detected')
  return abs
}

/** Library-relative, '/'-separated form of an absolute path inside PHOTOS_ROOT. */
export function toRel(abs: string): string {
  return path.relative(PHOTOS_ROOT, abs).split(path.sep).join('/')
}

export function cacheDirFor(id: string): string {
  return path.join(PHOTOS_CACHE, id)
}

let cacheReady = false
/** Create the local cache dir lazily. The library dirs live on the NAS and are created on demand. */
export function ensureCacheDir(): void {
  if (cacheReady) return
  fs.mkdirSync(PHOTOS_CACHE, { recursive: true })
  cacheReady = true
}

/** Mount guard: the marker exists only on the real library (NAS share), never on an empty mount point. */
export async function libraryMarkerPresent(): Promise<boolean> {
  try {
    return (await fs.promises.stat(path.join(PHOTOS_ROOT, LIBRARY_MARKER))).isFile()
  } catch {
    return false
  }
}
