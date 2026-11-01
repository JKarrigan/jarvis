import 'server-only'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { createHash, randomUUID } from 'crypto'
import type { ApiEntry, DiskInfo, FileThumbSize, FolderStats, SearchResult } from '@/lib/fileTypes'
import { isMountPoint, rootOnline } from '@/lib/mount'

export { isMountPoint } from '@/lib/mount'

/**
 * Absolute, normalised storage root (a trailing slash in the env var is fine).
 * This is the Documents share (`/mnt/nas/documents` on the Pi).
 */
export const FILES_ROOT = path.resolve(process.env.FILES_ROOT ?? '/mnt/storage')

/** Disposable thumbnail cache on local disk (never on the share). */
export const FILES_CACHE = path.resolve(process.env.FILES_CACHE ?? path.join(process.cwd(), '.files-cache'))

/** An error with an HTTP status and a message that is safe to show the client. */
export class FilesError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'FilesError'
  }
}

// ── Mount guard ──────────────────────────────────────────────────────────────

/**
 * False when the documents root is missing, not a directory, or — with
 * `NAS_REQUIRE_MOUNT=1` — not a mount point (an empty mount point on the SD
 * card must never be listed or written to).
 */
export function storageOnline(): Promise<boolean> {
  return rootOnline(FILES_ROOT)
}

/** True when FILES_ROOT is itself a mount point (diagnostics; the guard is storageOnline). */
export function filesRootMounted(): Promise<boolean> {
  return isMountPoint(FILES_ROOT)
}

/** `{ error: 'Storage offline', offline: true }` with 503. */
export function offlineResponse(): Response {
  return Response.json({ error: 'Storage offline', offline: true }, { status: 503, headers: { 'Retry-After': '30' } })
}

/** Null when storage is online, else the 503 offline Response. Call after assertSameOrigin. */
export async function assertStorageOnline(): Promise<Response | null> {
  return (await storageOnline()) ? null : offlineResponse()
}

// ── Hidden entries ───────────────────────────────────────────────────────────

/** Synology housekeeping folders that are not dot-entries. */
const HIDDEN_NAMES = new Set(['#recycle', '#snapshot', '@eaDir'])

/** Entries never shown in listings, search or folder stats: dot-entries, NAS housekeeping, `*.part` upload temps. */
export function isHiddenName(name: string): boolean {
  return name.startsWith('.') || HIDDEN_NAMES.has(name) || name.toLowerCase().endsWith('.part')
}

/** True when `abs` is `root` itself or below it (separator-aware: /mnt/storage2 is not inside /mnt/storage). */
export function isInside(abs: string, root: string = FILES_ROOT): boolean {
  return abs === root || abs.startsWith(root.endsWith(path.sep) ? root : root + path.sep)
}

/** The root with symlinks resolved (the mount point may itself be a link); not cached while missing. */
let realRootCache: string | null = null
function realRoot(): string {
  if (realRootCache) return realRootCache
  try {
    realRootCache = fs.realpathSync(FILES_ROOT)
    return realRootCache
  } catch {
    return FILES_ROOT
  }
}

/** realpath of `abs`, or of its nearest existing ancestor joined with the missing tail. */
function realpathLoose(abs: string): string {
  let cur = abs
  const tail: string[] = []
  for (;;) {
    try {
      return path.join(fs.realpathSync(cur), ...tail)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' && (e as NodeJS.ErrnoException).code !== 'ENOTDIR') throw e
      const parent = path.dirname(cur)
      if (parent === cur) return abs
      tail.unshift(path.basename(cur))
      cur = parent
    }
  }
}

/**
 * Resolves a client-supplied path (relative to FILES_ROOT) to an absolute path
 * inside the storage root. `..` cannot climb above the root, and symlinks that
 * point outside it are refused. With `followLeaf: false` only the parent
 * directory is resolved, so a symlink itself can be renamed or deleted.
 */
export function resolveSafe(relPath: string, { followLeaf = true }: { followLeaf?: boolean } = {}): string {
  if (relPath.includes('\0')) throw new FilesError('Invalid path', 400)
  const abs = path.join(FILES_ROOT, path.normalize('/' + relPath))
  const trimmed = abs.length > 1 && abs.endsWith(path.sep) ? abs.slice(0, -1) : abs
  if (!isInside(trimmed)) throw new FilesError('Forbidden', 403)
  if (trimmed === FILES_ROOT) return trimmed

  const toCheck = followLeaf ? trimmed : path.dirname(trimmed)
  let real: string
  try {
    real = realpathLoose(toCheck)
  } catch {
    throw new FilesError('Forbidden', 403)
  }
  if (!isInside(real, realRoot())) throw new FilesError('Forbidden', 403)
  return trimmed
}

/**
 * Like resolveSafe, for paths that will be modified (delete/rename/move source,
 * mkdir): the path is required and may never be the storage root itself.
 */
export function resolveEntry(relPath: string | null | undefined): string {
  if (relPath == null || relPath.trim() === '') throw new FilesError('Missing path', 400)
  const abs = resolveSafe(relPath, { followLeaf: false })
  if (abs === FILES_ROOT) throw new FilesError('Cannot modify the storage root', 403)
  return abs
}

/** Validates a single path segment supplied by the client (new name, upload file name). */
export function isValidName(name: string): boolean {
  return name.length > 0 && Buffer.byteLength(name) <= 255 && name !== '.' && name !== '..'
    && !/[/\\\0]/.test(name)
}

/** Maps an fs error to a Response with a generic message; logs the real error server-side. */
export function filesErrorResponse(e: unknown, context: string): Response {
  if (e instanceof FilesError) return Response.json({ error: e.message }, { status: e.status })
  const code = (e as NodeJS.ErrnoException | null)?.code
  const known: Record<string, [number, string]> = {
    ENOENT: [404, 'Not found'],
    ENOTDIR: [400, 'Not a folder'],
    EISDIR: [400, 'Is a folder'],
    EEXIST: [409, 'An item with that name already exists'],
    ENOTEMPTY: [409, 'Folder is not empty'],
    EINVAL: [400, 'Invalid operation'],
    EACCES: [403, 'Permission denied'],
    EPERM: [403, 'Permission denied'],
    EROFS: [403, 'Storage is read-only'],
    ENOSPC: [507, 'Storage is full'],
    ENAMETOOLONG: [400, 'Name too long'],
  }
  const hit = code ? known[code] : undefined
  if (!hit || hit[0] >= 500) console.error(`[files] ${context} failed:`, e)
  const [status, message] = hit ?? [500, 'Internal error']
  return Response.json({ error: message }, { status })
}

/** Runs `fn` over `items` with at most `limit` in flight (keeps an SD card from being swamped). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

async function countChildren(abs: string): Promise<number> {
  try {
    return (await fsp.readdir(abs)).filter(n => !isHiddenName(n)).length
  } catch {
    return 0
  }
}

async function toApiEntry(dirent: fs.Dirent, abs: string): Promise<ApiEntry | null> {
  try {
    const stat = await fsp.stat(abs)
    if (dirent.isDirectory()) {
      return { name: dirent.name, kind: 'dir', modified: stat.mtime.toISOString(), childCount: await countChildren(abs) }
    }
    if (dirent.isFile()) {
      const ext = path.extname(dirent.name).slice(1)
      return { name: dirent.name, kind: 'file', size: stat.size, modified: stat.mtime.toISOString(), ext }
    }
  } catch {
    // skip entries we can't stat
  }
  return null
}

export async function listDirectory(relPath: string): Promise<ApiEntry[]> {
  const abs = resolveSafe(relPath)
  const dirents = (await fsp.readdir(abs, { withFileTypes: true })).filter(d => !isHiddenName(d.name))
  const entries = await mapLimit(dirents, 16, d => toApiEntry(d, path.join(abs, d.name)))
  return entries.filter((e): e is ApiEntry => e !== null)
}

export async function getDiskInfo(mountPath: string): Promise<DiskInfo> {
  try {
    const s = await fsp.statfs(mountPath)
    return { totalBytes: s.blocks * s.bsize, usedBytes: (s.blocks - s.bfree) * s.bsize }
  } catch {
    return { usedBytes: 0, totalBytes: 0 }
  }
}

/**
 * Deletes a file or folder. With `recursive: false` a folder is only removed
 * when it is empty (ENOTEMPTY → 409) — used for the client's no-confirm path.
 */
/**
 * Synology's share recycle bin. NFS deletes bypass it (only SMB/AFP/File Station
 * deletes land there), so the app moves deleted items into it itself when it
 * exists: they then show up in DSM's Recycle Bin and follow its retention policy.
 */
export const RECYCLE_DIR = '#recycle'

export async function recycleAvailable(): Promise<boolean> {
  try {
    return (await fsp.stat(path.join(FILES_ROOT, RECYCLE_DIR))).isDirectory()
  } catch {
    return false
  }
}

/** `dir/name`, or `dir/name (2).ext`, `(3)`… when that is taken. */
async function freeName(dir: string, name: string): Promise<string> {
  const dot = name.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  for (let n = 1; n < 1000; n++) {
    const candidate = path.join(dir, n === 1 ? name : `${stem} (${n})${ext}`)
    try { await fsp.lstat(candidate) } catch { return candidate }
  }
  return path.join(dir, `${stem} (${randomUUID().slice(0, 8)})${ext}`)
}

/**
 * Deletes an entry. With the share's recycle bin present (and `recursive`), the
 * item is moved to `#recycle/<its folder path>/` instead and `{ recycled: true }`
 * is returned; otherwise it is removed permanently. `recursive: false` only removes
 * an empty folder (ENOTEMPTY otherwise) and never needs the recycle bin.
 */
export async function deleteEntry(
  relPath: string | null,
  { recursive = true }: { recursive?: boolean } = {},
): Promise<{ recycled: boolean }> {
  const abs = resolveEntry(relPath)
  const stat = await fsp.lstat(abs)
  if (stat.isDirectory() && !recursive) { await fsp.rmdir(abs); return { recycled: false } }
  if (await recycleAvailable()) {
    const rel = path.relative(FILES_ROOT, abs)
    const destDir = path.join(FILES_ROOT, RECYCLE_DIR, path.dirname(rel))
    await fsp.mkdir(destDir, { recursive: true })
    await fsp.rename(abs, await freeName(destDir, path.basename(abs)))
    return { recycled: true }
  }
  if (!stat.isDirectory()) await fsp.unlink(abs)
  else await fsp.rm(abs, { recursive: true })
  return { recycled: false }
}

export async function createDirectory(relPath: string | null): Promise<void> {
  const abs = resolveEntry(relPath)
  await fsp.mkdir(abs, { recursive: true })
}

async function exists(abs: string): Promise<fs.Stats | null> {
  try {
    return await fsp.lstat(abs)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

/** Moves an entry into another folder. Never overwrites: an existing destination → 409. */
export async function moveEntry(fromRel: string | null, toDirRel: string | null): Promise<void> {
  const absFrom = resolveEntry(fromRel)
  const absToDir = resolveSafe(toDirRel ?? '')
  const toStat = await fsp.stat(absToDir)
  if (!toStat.isDirectory()) throw new FilesError('Destination is not a folder', 400)
  if (isInside(absToDir, absFrom)) throw new FilesError('Cannot move a folder into itself', 400)
  const dest = path.join(absToDir, path.basename(absFrom))
  if (!isInside(dest) || dest === FILES_ROOT) throw new FilesError('Forbidden', 403)
  if (dest === absFrom) return
  await fsp.lstat(absFrom)
  if (await exists(dest)) throw new FilesError(`"${path.basename(dest)}" already exists there`, 409)
  await fsp.rename(absFrom, dest)
}

/** Renames an entry in place. Never overwrites: an existing destination → 409. */
export async function renameEntry(relPath: string | null, newName: string): Promise<void> {
  if (!isValidName(newName)) throw new FilesError('Invalid name', 400)
  const abs = resolveEntry(relPath)
  const dest = path.join(path.dirname(abs), newName)
  if (!isInside(dest) || dest === FILES_ROOT) throw new FilesError('Forbidden', 403)
  if (dest === abs) return
  const src = await fsp.lstat(abs)
  const existing = await exists(dest)
  // On case-insensitive filesystems a case-only rename "finds" the source itself.
  if (existing && !(existing.ino === src.ino && existing.dev === src.dev)) {
    throw new FilesError(`"${newName}" already exists`, 409)
  }
  await fsp.rename(abs, dest)
}

const SEARCH_MAX_DEPTH = 6
const SEARCH_MAX_VISITED = 20_000

/**
 * Case-insensitive name search under `rootRel`. Breadth-first and bounded: at
 * most `limit` results, depth 6 and ~20k visited entries, and it stops as soon
 * as `signal` aborts (client went away). `truncated` reports a hit bound.
 */
export async function searchEntries(
  rootRel: string,
  query: string,
  { limit = 200, signal }: { limit?: number; signal?: AbortSignal } = {},
): Promise<{ results: SearchResult[]; truncated: boolean }> {
  const root = resolveSafe(rootRel)
  const lowerQ = query.toLowerCase()
  const results: SearchResult[] = []
  let visited = 0
  let truncated = false
  let level: string[] = [root]

  for (let depth = 0; depth <= SEARCH_MAX_DEPTH && level.length > 0; depth++) {
    const nextLevel: string[] = []
    for (const dir of level) {
      if (signal?.aborted) return { results, truncated: true }
      let dirents: fs.Dirent[]
      try { dirents = await fsp.readdir(dir, { withFileTypes: true }) } catch { continue }
      for (const dirent of dirents) {
        if (isHiddenName(dirent.name)) continue
        if (++visited > SEARCH_MAX_VISITED) return { results, truncated: true }
        const entAbs = path.join(dir, dirent.name)
        if (dirent.name.toLowerCase().includes(lowerQ)) {
          const entry = await toApiEntry(dirent, entAbs)
          if (entry) results.push({ ...entry, relPath: path.relative(FILES_ROOT, entAbs) })
          if (results.length >= limit) return { results, truncated: true }
        }
        if (dirent.isDirectory()) {
          if (depth < SEARCH_MAX_DEPTH) nextLevel.push(entAbs)
          else truncated = true
        }
      }
    }
    level = nextLevel
  }
  return { results, truncated }
}

// ── Folder stats ─────────────────────────────────────────────────────────────

const STATS_MAX_ENTRIES = 20_000

/**
 * Recursive totals for a folder (the folder itself not counted), for the delete
 * confirm. Bounded: stops after 20k entries or when `signal` aborts, reporting
 * `truncated`. Hidden entries are skipped (as in listings) and symlinks are not
 * followed. A file path yields `{ files: 1, folders: 0, bytes: size }`.
 */
export async function folderStats(relPath: string, signal?: AbortSignal): Promise<FolderStats> {
  const root = resolveSafe(relPath)
  const rootStat = await fsp.stat(root)
  if (!rootStat.isDirectory()) return { files: 1, folders: 0, bytes: rootStat.size, truncated: false }

  const out: FolderStats = { files: 0, folders: 0, bytes: 0, truncated: false }
  let visited = 0
  const queue: string[] = [root]
  for (let qi = 0; qi < queue.length; qi++) {
    if (signal?.aborted) return { ...out, truncated: true }
    const dir = queue[qi]
    let dirents: fs.Dirent[]
    try { dirents = await fsp.readdir(dir, { withFileTypes: true }) } catch { continue }
    const files: string[] = []
    for (const d of dirents) {
      if (isHiddenName(d.name)) continue
      if (++visited > STATS_MAX_ENTRIES) {
        out.truncated = true
        break
      }
      const abs = path.join(dir, d.name)
      if (d.isDirectory()) {
        out.folders++
        queue.push(abs)
      } else {
        out.files++
        if (d.isFile()) files.push(abs)
      }
    }
    const sizes = await mapLimit(files, 16, async f => {
      try { return (await fsp.lstat(f)).size } catch { return 0 }
    })
    for (const n of sizes) out.bytes += n
    if (out.truncated) return out
  }
  return out
}

// ── Thumbnail cache key ─────────────────────────────────────────────────────

/**
 * Cache file name (sha1 hex) for a thumbnail of `relPath` at `size` for the file
 * version with `mtimeMs`. The path is normalised the way resolveSafe sees it, so
 * `a/b.pdf`, `/a/b.pdf` and `a//b.pdf` share one entry; an edit (new mtime)
 * gets a new key.
 */
export function thumbCacheKey(relPath: string, size: FileThumbSize, mtimeMs: number): string {
  const norm = path.posix.normalize('/' + relPath).replace(/\/+$/, '') || '/'
  return createHash('sha1').update(`${norm}\0${size}\0${Math.floor(mtimeMs)}`).digest('hex')
}

/** Absolute cache path for a thumbnail key (sharded by the first two hex chars). */
export function thumbCachePath(key: string): string {
  return path.join(FILES_CACHE, key.slice(0, 2), `${key}.webp`)
}

// ── Uploads ────────────────────────────────────────────────────────────────

/** Reduces a client-supplied upload file name to a safe single segment, or null. */
export function safeUploadName(filename: string | undefined): string | null {
  const base = (filename ?? '').split(/[/\\]/).pop()?.trim() ?? ''
  return isValidName(base) ? base : null
}

/** Hidden temp file next to the destination, so the final rename stays on one filesystem. */
export function uploadTempPath(dirAbs: string, name: string): string {
  return path.join(dirAbs, `.${name}.${randomUUID()}.part`)
}

/**
 * Moves a finished temp file to `dest` without ever replacing an existing file
 * (EEXIST → FilesError 409). Uses link+unlink; on filesystems without hard links
 * (exFAT/FAT SD cards) it reserves the name with an exclusive create first.
 */
export async function commitNoClobber(tmp: string, dest: string): Promise<void> {
  try {
    await fsp.link(tmp, dest)
    await fsp.unlink(tmp)
    return
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EEXIST') throw new FilesError(`"${path.basename(dest)}" already exists`, 409)
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EMLINK'].includes(code ?? '')) throw e
  }
  try {
    await (await fsp.open(dest, 'wx')).close()
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new FilesError(`"${path.basename(dest)}" already exists`, 409)
    throw e
  }
  await fsp.rename(tmp, dest)
}
