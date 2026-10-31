import 'server-only'
import fs from 'fs'
import path from 'path'
import { LIBRARY_MARKER, PHOTOS_ROOT, ensureLibraryMarker, extOf, kindForExt, libraryMarkerPresent, toRel } from './config'
import {
  countLiveRows, getLastScan, getLiveFileRows, getMissingRowsByHash, getThumbCandidates,
  insertPhoto, markMissing, newId, relinkPhoto, setLastScan, updatePhotoFile,
  type LiveFileRow, type PhotoInsert,
} from './db'
import { cheapHash, extractMeta } from './meta'
import { clearDerived, getDerived, hasThumbOrFailed, runLimited } from './thumbs'
import { importCatalogIfEmpty, markCatalogDirty } from './catalog'
import type { ScanStatus } from './types'

const SCAN_EVERY_MS = 6 * 60 * 60 * 1000
const FIRST_SCAN_DELAY_MS = 3_000
/** Synology / NAS housekeeping folders that are not dot-entries. */
const SKIP_DIRS = new Set(['@eaDir', '#recycle', '#snapshot'])

interface ScanState {
  status: ScanStatus
  promise: Promise<ScanStatus> | null
  rerun: boolean
  timer: ReturnType<typeof setInterval> | null
}

const g = globalThis as typeof globalThis & { __photos_scan?: ScanState }

function idleStatus(): ScanStatus {
  return {
    running: false, phase: 'idle', startedAt: null, finishedAt: null, lastScan: null,
    libraryOnline: true, error: null, found: 0, processed: 0, added: 0, updated: 0,
    moved: 0, missing: 0, catalogImported: 0, thumbsPending: 0, thumbsDone: 0,
  }
}

function state(): ScanState {
  return (g.__photos_scan ??= { status: idleStatus(), promise: null, rerun: false, timer: null })
}

export function getScanStatus(): ScanStatus {
  const s = state().status
  return { ...s, lastScan: s.lastScan ?? getLastScan() }
}

// ── Walk ─────────────────────────────────────────────────────────────────────

interface WalkedFile { rel: string; abs: string; size: number; mtime: number }

async function walk(root: string): Promise<{ files: WalkedFile[]; errors: number }> {
  const files: WalkedFile[] = []
  let errors = 0
  async function visit(dir: string): Promise<void> {
    let dirents: fs.Dirent[]
    try {
      dirents = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch (e) {
      if (dir === root) throw e
      errors++
      return
    }
    for (const d of dirents) {
      if (d.name.startsWith('.') || SKIP_DIRS.has(d.name)) continue
      const abs = path.join(dir, d.name)
      if (d.isDirectory()) { await visit(abs); continue }
      if (!d.isFile() || !kindForExt(extOf(d.name))) continue // symlinks and unsupported files are ignored
      try {
        const st = await fs.promises.stat(abs)
        if (st.size === 0) continue // empty, or an upload placeholder about to be renamed over
        files.push({ rel: toRel(abs), abs, size: st.size, mtime: Math.floor(st.mtimeMs) })
      } catch {
        errors++
      }
    }
  }
  await visit(root)
  return { files, errors }
}

async function buildRow(id: string, f: WalkedFile, hash: string): Promise<PhotoInsert> {
  const meta = await extractMeta(f.abs, extOf(f.rel))
  return {
    id, rel_path: f.rel, kind: meta.kind, size: f.size, mtime: f.mtime, hash,
    taken_at: meta.takenAt ?? f.mtime, width: meta.width, height: meta.height, duration: meta.duration,
    mime: meta.mime, camera: meta.camera, lat: meta.lat, lon: meta.lon, indexed_at: Date.now(),
  }
}

// ── Scan ─────────────────────────────────────────────────────────────────────

async function doScan(st: ScanStatus): Promise<void> {
  // 1. Mount guard. Any error reading PHOTOS_ROOT itself means the share is offline.
  try {
    await fs.promises.readdir(PHOTOS_ROOT)
  } catch (e) {
    st.libraryOnline = false
    st.error = `Library offline: ${(e as Error).message}`
    return
  }
  let marked = await libraryMarkerPresent()
  if (!marked && countLiveRows() > 0) {
    // The index has files but the marker is missing: either the share is not mounted
    // (an empty directory is masking it) or the marker was never written (files were
    // uploaded before any scan ran). Settle it by looking for indexed files on disk.
    if (await indexedFilesPresent()) {
      await ensureLibraryMarker()
      marked = await libraryMarkerPresent()
    } else {
      st.libraryOnline = false
      st.error = `Library offline: ${LIBRARY_MARKER} not found in ${PHOTOS_ROOT} (share not mounted?)`
      return
    }
  }
  st.libraryOnline = true

  // 2. Walk.
  st.phase = 'walking'
  const { files, errors } = await walk(PHOTOS_ROOT)
  st.found = files.length

  // 3. Diff against the index. Unchanged size+mtime → nothing to do.
  st.phase = 'indexing'
  const byRel = new Map<string, LiveFileRow>(getLiveFileRows().map(r => [r.rel_path, r]))
  const fresh: WalkedFile[] = []
  for (const f of files) {
    const row = byRel.get(f.rel)
    if (!row) { fresh.push(f); continue }
    byRel.delete(f.rel)
    if (row.size === f.size && row.mtime === f.mtime) continue
    try {
      await runLimited(async () => {
        const hash = await cheapHash(f.abs, f.size)
        updatePhotoFile(await buildRow(row.id, f, hash))
      }, 'low')
      await clearDerived(row.id)
      st.updated++
    } catch (e) {
      console.warn('[photos] reindex failed', f.rel, e)
    }
    st.processed++
  }

  // Rows whose path was not seen: candidates for "moved" (same content elsewhere) or "missing".
  const gone = new Map<string, LiveFileRow>()
  for (const r of byRel.values()) if (r.hash) gone.set(`${r.size}:${r.hash}`, r)
  const revivable = getMissingRowsByHash()

  let catalogDirty = false
  for (const f of fresh) {
    try {
      await runLimited(async () => {
        const hash = await cheapHash(f.abs, f.size)
        const key = `${f.size}:${hash}`
        const prev = gone.get(key) ?? revivable.get(key)
        if (prev) {
          // Moved/renamed on the share, or back after going missing: keep id, favorite, albums.
          relinkPhoto(prev.id, f.rel, f.mtime)
          gone.delete(key)
          revivable.delete(key)
          byRel.delete(prev.rel_path)
          st.moved++
          catalogDirty = true
        } else {
          insertPhoto(await buildRow(newId(), f, hash))
          st.added++
        }
      }, 'low')
    } catch (e) {
      console.warn('[photos] index failed', f.rel, e)
    }
    st.processed++
  }

  // 4. Missing files. Skipped if any part of the walk failed: an unreadable folder is not a deletion.
  if (errors === 0) {
    const now = Date.now()
    for (const r of byRel.values()) {
      markMissing(r.id, r.rel_path, now)
      st.missing++
      catalogDirty = true
    }
  } else {
    st.error = `${errors} folder(s)/file(s) could not be read; missing-file detection skipped`
  }

  // 5. First successful scan of a non-empty library: drop the mount-guard marker.
  if (!marked && files.length > 0) await ensureLibraryMarker()

  // 6. Fresh index (new Pi / restored SD card): restore favorites + albums from the NAS.
  st.catalogImported = await importCatalogIfEmpty()
  if (catalogDirty) markCatalogDirty()

  const finished = Date.now()
  setLastScan(finished)
  st.lastScan = finished

  // 7. Background thumbnail fill, newest first, one low-priority job at a time
  //    (leaves the other queue slot for on-demand requests).
  st.phase = 'thumbnails'
  const todo: string[] = []
  for (const c of getThumbCandidates()) if (!(await hasThumbOrFailed(c.id, c.mtime))) todo.push(c.id)
  st.thumbsPending = todo.length
  for (const id of todo) {
    try { await getDerived(id, 't', 'low') } catch { /* recorded as failed by getDerived */ }
    st.thumbsDone++
    st.thumbsPending--
  }
}

/**
 * Run a scan (single-flight). A request made while one is running schedules
 * exactly one follow-up run, so uploads during a long scan are not lost.
 */
export function runScan(): Promise<ScanStatus> {
  const s = state()
  if (s.promise) {
    s.rerun = true
    return s.promise
  }
  const st: ScanStatus = { ...idleStatus(), running: true, phase: 'walking', startedAt: Date.now(), lastScan: getLastScan() }
  s.status = st
  s.promise = (async () => {
    try {
      await doScan(st)
    } catch (e) {
      st.error = (e as Error).message ?? String(e)
      console.error('[photos] scan failed:', e)
    } finally {
      st.running = false
      st.phase = 'idle'
      st.finishedAt = Date.now()
      s.promise = null
    }
    if (s.rerun) {
      s.rerun = false
      void runScan()
    }
    return { ...st }
  })()
  return s.promise
}

/** Fire-and-forget scan (after upload, from the settings sheet). */
export function requestScan(): void {
  void runScan()
}

// ── Schedule: first import from a server route + every 6 h ───────────────────

function tick(): void {
  void runScan()
}

// Hot reload: swap the interval to the fresh closure (same pattern as lib/poller.ts).
if (g.__photos_scan?.timer) {
  clearInterval(g.__photos_scan.timer)
  g.__photos_scan.timer = setInterval(tick, SCAN_EVERY_MS)
  g.__photos_scan.timer.unref?.()
}

export function startPhotoScheduler(): void {
  // `next build` loads route modules to collect config; never scan from the build.
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const s = state()
  if (s.timer) return
  s.timer = setInterval(tick, SCAN_EVERY_MS)
  s.timer.unref?.()
  setTimeout(tick, FIRST_SCAN_DELAY_MS).unref?.()
}


/** Live mount-guard check (cheap): PHOTOS_ROOT readable and, once the index has rows, the marker present. */
/** True when at least one of (up to 8) indexed, non-trashed files exists under PHOTOS_ROOT. */
async function indexedFilesPresent(): Promise<boolean> {
  const rows = getLiveFileRows().slice(0, 8)
  for (const r of rows) {
    try {
      await fs.promises.access(path.join(PHOTOS_ROOT, r.rel_path), fs.constants.R_OK)
      return true
    } catch { /* keep looking */ }
  }
  return false
}

export async function checkLibraryOnline(): Promise<boolean> {
  try {
    await fs.promises.access(PHOTOS_ROOT, fs.constants.R_OK)
  } catch {
    return false
  }
  if (await libraryMarkerPresent()) return true
  if (countLiveRows() === 0) return true
  // Marker missing but the index has files: online iff those files are really there.
  if (await indexedFilesPresent()) {
    await ensureLibraryMarker()
    return true
  }
  return false
}

/** Scan status with `libraryOnline` re-checked now (unless a scan is running and owns it). */
export async function getScanStatusLive(): Promise<ScanStatus> {
  const s = getScanStatus()
  if (!s.running) s.libraryOnline = await checkLibraryOnline()
  return s
}
