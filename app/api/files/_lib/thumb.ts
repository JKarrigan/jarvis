import 'server-only'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import sharp, { type Sharp } from 'sharp'
import { thumbCacheKey, thumbCachePath } from '@/lib/files'
import type { FileThumbSize } from '@/lib/fileTypes'
import { isSharpReadable } from '@/lib/photos/config'
import { decodeHeifFrame, runLimited } from '@/lib/photos/thumbs'

/** Long edge per size. */
const EDGE: Record<FileThumbSize, number> = { t: 320, p: 1280 }
const QUALITY: Record<FileThumbSize, number> = { t: 70, p: 82 }
const PDFTOPPM = process.env.PDFTOPPM_PATH ?? 'pdftoppm'
const PDF_TIMEOUT_MS = 20_000
const PDF_MAX_BUFFER = 64 * 1024 * 1024
const FAIL_SUFFIX = '.fail'

type Source = 'image' | 'heif' | 'pdf'

interface ThumbState {
  /** pdftoppm was not found (ENOENT) once: PDFs have no preview until the process restarts. */
  pdftoppmMissing: boolean
  inflight: Map<string, Promise<string | null>>
}
const g = globalThis as typeof globalThis & { __files_thumbs?: ThumbState }
const st: ThumbState = (g.__files_thumbs ??= { pdftoppmMissing: false, inflight: new Map() })

/** Which decoder a file extension uses, or null when there is no preview for it. */
export function thumbSource(ext: string): Source | null {
  const e = ext.toLowerCase()
  if (e === 'heic' || e === 'heif') return 'heif'
  if (e === 'pdf') return st.pdftoppmMissing ? null : 'pdf'
  if (isSharpReadable(e)) return 'image'
  return null
}

class PdftoppmMissing extends Error {}

/**
 * Renders page 1 of a PDF to PNG. pdftoppm's "-" output root is not stdout with
 * `-singlefile` (poppler 25 writes a file literally named "-.png" in the cwd), so
 * render into a private temp directory and read the file back.
 */
async function pdfFirstPage(abs: string, edge: number): Promise<Buffer> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdfthumb-'))
  const root = path.join(dir, 'page')
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(PDFTOPPM, ['-f', '1', '-l', '1', '-scale-to', String(edge), '-png', '-singlefile', abs, root],
        { encoding: 'buffer', timeout: PDF_TIMEOUT_MS, maxBuffer: PDF_MAX_BUFFER, killSignal: 'SIGKILL' },
        (err, _stdout, stderr) => {
          if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') return reject(new PdftoppmMissing())
          if (err) return reject(new Error(`pdftoppm failed: ${stderr.toString('utf8').trim().slice(-300) || err.message}`))
          resolve()
        })
    })
    const png = await fs.promises.readFile(`${root}.png`).catch(() => null)
    if (!png?.length) throw new Error('pdftoppm produced no image')
    return png
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true })
  }
}

async function source(abs: string, kind: Source, edge: number): Promise<Sharp> {
  if (kind === 'heif') return (await decodeHeifFrame(abs))()
  if (kind === 'pdf') return sharp(await pdfFirstPage(abs, edge))
  // animated: false → first frame of GIF/WebP; rotate() applies EXIF orientation.
  return sharp(abs, { failOn: 'none', animated: false, limitInputPixels: 268_402_689 }).rotate()
}

async function render(abs: string, kind: Source, size: FileThumbSize, dest: string): Promise<void> {
  const edge = EDGE[size]
  const img = await source(abs, kind, edge)
  await fs.promises.mkdir(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`
  try {
    await img
      .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY[size], effort: 3 })
      .toFile(tmp)
    await fs.promises.rename(tmp, dest)
  } catch (e) {
    await fs.promises.rm(tmp, { force: true })
    throw e
  }
}

const exists = (p: string) => fs.promises.access(p).then(() => true, () => false)

/**
 * Path of the cached WebP thumbnail for a documents file, generating it through
 * the shared 2-slot Photos queue. Null when the file has no preview: an
 * unsupported type, pdftoppm not installed, or a decode that already failed for
 * this file version (remembered with a `.fail` marker next to the cache entry).
 * Throws when the original cannot be read (share offline, file gone).
 */
export async function getFileThumb(relPath: string, abs: string, mtimeMs: number, size: FileThumbSize): Promise<string | null> {
  const kind = thumbSource(path.extname(abs).slice(1))
  if (!kind) return null
  const key = thumbCacheKey(relPath, size, mtimeMs)
  const out = thumbCachePath(key)
  if (await exists(out)) return out
  if (await exists(out + FAIL_SUFFIX)) return null

  let p = st.inflight.get(key)
  if (!p) {
    p = runLimited(async (): Promise<string | null> => {
      if (await exists(out)) return out
      try {
        await render(abs, kind, size, out)
        return out
      } catch (e) {
        if (e instanceof PdftoppmMissing) {
          if (!st.pdftoppmMissing) console.warn(`[files] ${PDFTOPPM} not found: PDF thumbnails disabled (install poppler-utils)`)
          st.pdftoppmMissing = true
          return null
        }
        // Original unreadable (share went away mid-request): transient, don't mark.
        await fs.promises.access(abs, fs.constants.R_OK)
        console.warn(`[files] thumbnail failed for ${relPath}:`, e instanceof Error ? e.message : e)
        await fs.promises.mkdir(path.dirname(out), { recursive: true }).catch(() => {})
        await fs.promises.writeFile(out + FAIL_SUFFIX, '').catch(() => {})
        return null
      }
    }).finally(() => { st.inflight.delete(key) })
    st.inflight.set(key, p)
  }
  return p
}
