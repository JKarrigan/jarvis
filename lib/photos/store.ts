import 'server-only'
import fs from 'fs'
import path from 'path'
import { PHOTOS_ROOT, TRASH_DIR, UPLOAD_TMP_DIR, extOf, kindForExt, photoAbs, ensureLibraryMarker } from './config'
import {
  MISSING_PREFIX, deletePhotoRow, findLiveByHash, getPhotoRow, getPhotoRowByRel, getTrashedRows,
  insertPhoto, newId, relPathTaken, setTrashed,
} from './db'
import { cheapHash, extractMeta } from './meta'
import { clearDerived, runLimited } from './thumbs'
import { markCatalogDirty } from './catalog'
import type { UploadResult } from './types'

export class StoreError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

const TRASH_PREFIX = `${TRASH_DIR}/`

// ── File helpers ─────────────────────────────────────────────────────────────

async function exists(abs: string): Promise<boolean> {
  try { await fs.promises.lstat(abs); return true } catch { return false }
}

/** rename(), falling back to copy+unlink across filesystems. */
async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await fs.promises.rename(src, dest)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
    await fs.promises.copyFile(src, dest)
    await fs.promises.unlink(src)
  }
}

function splitName(name: string): [string, string] {
  const ext = path.extname(name)
  return [name.slice(0, name.length - ext.length), ext]
}

/**
 * Atomically reserve a free `dir/name` (adding " (2)", " (3)"… on collision) by
 * creating an empty placeholder with O_EXCL; the caller renames over it.
 */
async function reserveFreeRel(dirRel: string, name: string): Promise<string> {
  const [stem, ext] = splitName(name)
  await fs.promises.mkdir(photoAbs(dirRel), { recursive: true })
  for (let n = 1; n < 10_000; n++) {
    const candidate = n === 1 ? name : `${stem} (${n})${ext}`
    const rel = path.posix.join(dirRel, candidate)
    if (relPathTaken(rel)) continue
    try {
      const fh = await fs.promises.open(photoAbs(rel), 'wx')
      await fh.close()
      return rel
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    }
  }
  throw new StoreError('Too many files with this name', 409)
}

/** Strip directories, control and reserved characters, and leading dots (dot-files are hidden from the scan). */
export function sanitizeName(raw: string): string {
  const base = raw.replace(/\\/g, '/').split('/').pop() ?? ''
  let clean = base.replace(/[\u0000-\u001f\u007f:*?"<>|]/g, '_').replace(/^[.\s]+/, '').trim()
  const [rawStem, ext] = splitName(clean)
  let stem = rawStem
  if (!stem) stem = `upload-${Date.now()}`
  if (Buffer.byteLength(stem) > 150) stem = Buffer.from(stem).subarray(0, 150).toString('utf8').replace(/�+$/, '')
  clean = `${stem}${ext}`
  return clean
}

// ── Uploads ──────────────────────────────────────────────────────────────────

export function uploadTmpDir(): string {
  return path.join(PHOTOS_ROOT, UPLOAD_TMP_DIR)
}

/**
 * Move a fully written temp upload into `YYYY/MM/<name>` (capture date, else now),
 * deduplicating by content hash. Always consumes (moves or deletes) `tmpAbs`.
 */
export async function ingestUpload(tmpAbs: string, originalName: string): Promise<UploadResult> {
  const name = sanitizeName(originalName)
  const ext = extOf(name)
  const result: UploadResult = { name: originalName, status: 'error' }
  try {
    if (!kindForExt(ext)) return { ...result, error: 'Unsupported file type' }
    const st = await fs.promises.stat(tmpAbs)
    if (st.size === 0) return { ...result, error: 'Empty file' }

    return await runLimited(async () => {
      const hash = await cheapHash(tmpAbs, st.size)
      const dup = findLiveByHash(hash, st.size)
      if (dup) return { ...result, status: 'duplicate' as const, id: dup.id, relPath: dup.rel_path }

      const meta = await extractMeta(tmpAbs, ext)
      const takenAt = meta.takenAt ?? Date.now()
      const d = new Date(takenAt)
      const dirRel = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
      const rel = await reserveFreeRel(dirRel, name)
      const dest = photoAbs(rel)
      try {
        await moveFile(tmpAbs, dest)
      } catch (e) {
        await fs.promises.rm(dest, { force: true })
        throw e
      }
      const fst = await fs.promises.stat(dest)
      const id = newId()
      try {
        insertPhoto({
          id, rel_path: rel, kind: meta.kind, size: fst.size, mtime: Math.floor(fst.mtimeMs), hash,
          taken_at: takenAt, width: meta.width, height: meta.height, duration: meta.duration,
          mime: meta.mime, camera: meta.camera, lat: meta.lat, lon: meta.lon, indexed_at: Date.now(),
        })
      } catch (e) {
        // A concurrent scan may have indexed the file first.
        const row = getPhotoRowByRel(rel)
        if (!row) throw e
        return { ...result, status: 'created' as const, id: row.id, relPath: rel }
      }
      // The library now provably holds a file: make sure the mount-guard marker exists
      // (uploads can precede the first scan, which is what used to write it).
      await ensureLibraryMarker()
      return { ...result, status: 'created' as const, id, relPath: rel }
    }, 'high')
  } catch (e) {
    return { ...result, error: e instanceof StoreError ? e.message : 'Could not store file' }
  } finally {
    await fs.promises.rm(tmpAbs, { force: true }).catch(() => {})
  }
}

// ── Trash ────────────────────────────────────────────────────────────────────

async function freeRel(rel: string): Promise<string> {
  const [stem, ext] = splitName(rel)
  for (let n = 1; n < 10_000; n++) {
    const candidate = n === 1 ? rel : `${stem} (${n})${ext}`
    if (!relPathTaken(candidate) && !(await exists(photoAbs(candidate)))) return candidate
  }
  throw new StoreError('No free file name', 409)
}

/** Move to PHOTOS_ROOT/.trash/<original rel path>; the row stays with trashed_at set. */
export async function trashPhoto(id: string): Promise<void> {
  const row = getPhotoRow(id)
  if (!row) throw new StoreError('Not found', 404)
  if (row.trashed_at != null) throw new StoreError('Already in trash', 409)
  const now = Date.now()
  const src = photoAbs(row.rel_path)
  if (!(await exists(src))) {
    // Nothing to move: treat like the scanner would.
    setTrashed(id, `${MISSING_PREFIX}${id}/${row.rel_path}`, now)
  } else {
    const destRel = await freeRel(`${TRASH_PREFIX}${row.rel_path}`)
    const dest = photoAbs(destRel)
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    await moveFile(src, dest)
    setTrashed(id, destRel, now)
  }
  markCatalogDirty()
}

/** Put a trashed file back at its original path (with a collision suffix if that is taken now). */
export async function restorePhoto(id: string): Promise<string> {
  const row = getPhotoRow(id)
  if (!row) throw new StoreError('Not found', 404)
  if (row.trashed_at == null) throw new StoreError('Not in trash', 409)
  if (!row.rel_path.startsWith(TRASH_PREFIX)) throw new StoreError('The original file is missing and cannot be restored', 410)
  const src = photoAbs(row.rel_path)
  if (!(await exists(src))) throw new StoreError('The trashed file is gone', 410)
  const targetRel = await freeRel(row.rel_path.slice(TRASH_PREFIX.length))
  const dest = photoAbs(targetRel)
  await fs.promises.mkdir(path.dirname(dest), { recursive: true })
  await moveFile(src, dest)
  setTrashed(id, targetRel, null)
  await pruneEmptyDirs(path.dirname(src), path.join(PHOTOS_ROOT, TRASH_DIR))
  markCatalogDirty()
  return targetRel
}

/** Remove a trashed item for good: file, row, album memberships, derived images. */
export async function deletePermanently(id: string): Promise<void> {
  const row = getPhotoRow(id)
  if (!row) throw new StoreError('Not found', 404)
  if (row.trashed_at == null) throw new StoreError('Move the item to the trash first', 409)
  if (row.rel_path.startsWith(TRASH_PREFIX)) {
    await fs.promises.rm(photoAbs(row.rel_path), { force: true })
    await pruneEmptyDirs(path.dirname(photoAbs(row.rel_path)), path.join(PHOTOS_ROOT, TRASH_DIR))
  }
  deletePhotoRow(id)
  await clearDerived(id)
  markCatalogDirty()
}

export async function emptyTrash(): Promise<number> {
  let n = 0
  for (const row of getTrashedRows()) {
    try { await deletePermanently(row.id); n++ } catch (e) { console.warn('[photos] empty trash:', row.id, e) }
  }
  return n
}

/** Remove now-empty folders from `dir` up to (not including) `stop`. */
async function pruneEmptyDirs(dir: string, stop: string): Promise<void> {
  let cur = dir
  while (cur.startsWith(stop + path.sep)) {
    try { await fs.promises.rmdir(cur) } catch { return }
    cur = path.dirname(cur)
  }
}
