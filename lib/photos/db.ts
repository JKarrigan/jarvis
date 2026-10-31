import 'server-only'
import { randomBytes } from 'crypto'
import type Database from 'better-sqlite3'
import { getDb as getBaseDb, getSetting, setSetting } from '@/lib/db'
import type {
  Album, PhotoDetail, PhotoItem, PhotoKind, PhotoMonthCount, PhotoPage, PhotoYearCount,
} from './types'

// ── Schema ────────────────────────────────────────────────────────────────────

const g = globalThis as typeof globalThis & { __photos_tables?: boolean }

export function ensurePhotoTables(): void {
  if (g.__photos_tables) return
  getBaseDb().exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id         TEXT PRIMARY KEY,
      rel_path   TEXT UNIQUE NOT NULL,
      kind       TEXT NOT NULL,
      size       INTEGER,
      mtime      INTEGER,
      hash       TEXT,
      taken_at   INTEGER NOT NULL,
      width      INTEGER,
      height     INTEGER,
      duration   REAL,
      mime       TEXT,
      camera     TEXT,
      lat        REAL,
      lon        REAL,
      favorite   INTEGER DEFAULT 0,
      trashed_at INTEGER,
      indexed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS photos_taken   ON photos (taken_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS photos_trashed ON photos (trashed_at);
    CREATE INDEX IF NOT EXISTS photos_hash    ON photos (hash);
    CREATE TABLE IF NOT EXISTS albums (
      id         TEXT PRIMARY KEY,
      name       TEXT,
      created_at INTEGER,
      cover_id   TEXT
    );
    CREATE TABLE IF NOT EXISTS album_items (
      album_id TEXT,
      photo_id TEXT,
      added_at INTEGER,
      PRIMARY KEY (album_id, photo_id)
    );
    CREATE INDEX IF NOT EXISTS album_items_photo ON album_items (photo_id);
  `)
  g.__photos_tables = true
}

function db(): Database.Database {
  ensurePhotoTables()
  return getBaseDb()
}

export function newId(): string {
  return randomBytes(8).toString('hex')
}

// ── Rows ──────────────────────────────────────────────────────────────────────

export interface PhotoRow {
  id: string
  rel_path: string
  kind: PhotoKind
  size: number
  mtime: number
  hash: string | null
  taken_at: number
  width: number | null
  height: number | null
  duration: number | null
  mime: string
  camera: string | null
  lat: number | null
  lon: number | null
  favorite: number
  trashed_at: number | null
  indexed_at: number
}

export type PhotoInsert = Omit<PhotoRow, 'favorite' | 'trashed_at'>

export const MISSING_PREFIX = '.missing/'

function rowToItem(r: PhotoRow): PhotoItem {
  const item: PhotoItem = {
    id: r.id,
    kind: r.kind,
    takenAt: r.taken_at,
    width: r.width,
    height: r.height,
    favorite: r.favorite === 1,
    mime: r.mime,
    size: r.size,
    relPath: r.rel_path,
  }
  if (r.duration != null) item.duration = r.duration
  if (r.trashed_at != null) {
    item.trashedAt = r.trashed_at
    item.missing = r.rel_path.startsWith(MISSING_PREFIX)
  }
  return item
}

export function getPhotoRow(id: string): PhotoRow | null {
  return (db().prepare('SELECT * FROM photos WHERE id = ?').get(id) as PhotoRow | undefined) ?? null
}

export function getPhotoDetail(id: string): PhotoDetail | null {
  const r = getPhotoRow(id)
  if (!r) return null
  const albums = db()
    .prepare(`SELECT a.id, a.name FROM album_items ai JOIN albums a ON a.id = ai.album_id
              WHERE ai.photo_id = ? ORDER BY a.name COLLATE NOCASE`)
    .all(id) as { id: string; name: string }[]
  return {
    ...rowToItem(r),
    camera: r.camera,
    lat: r.lat,
    lon: r.lon,
    mtime: r.mtime,
    indexedAt: r.indexed_at,
    albumIds: albums.map(a => a.id),
    albums,
  }
}

// ── Timeline (keyset pagination on (taken_at, id) DESC) ──────────────────────

export interface PhotoQuery {
  cursor?: string | null
  limit: number
  kind?: PhotoKind
  favorite?: boolean
  album?: string
  year?: number
  month?: number
}

const CURSOR_RE = /^(-?\d{1,16})\.([0-9a-f]{16})$/

export function parseCursor(c: string): { key: number; id: string } | null {
  const m = CURSOR_RE.exec(c)
  if (!m) return null
  return { key: Number(m[1]), id: m[2] }
}

function makeCursor(key: number, id: string): string {
  return `${key}.${id}`
}

/** [start, end) epoch ms of a local-time year or month. */
export function periodRange(year: number, month?: number): [number, number] {
  if (month) return [new Date(year, month - 1, 1).getTime(), new Date(year, month, 1).getTime()]
  return [new Date(year, 0, 1).getTime(), new Date(year + 1, 0, 1).getTime()]
}

export function listPhotos(q: PhotoQuery): PhotoPage {
  const where: string[] = ['trashed_at IS NULL']
  const args: (string | number)[] = []
  if (q.kind) { where.push('kind = ?'); args.push(q.kind) }
  if (q.favorite) where.push('favorite = 1')
  if (q.album) {
    where.push('id IN (SELECT photo_id FROM album_items WHERE album_id = ?)')
    args.push(q.album)
  }
  if (q.year) {
    const [start, end] = periodRange(q.year, q.month)
    where.push('taken_at >= ? AND taken_at < ?')
    args.push(start, end)
  }
  const cur = q.cursor ? parseCursor(q.cursor) : null
  if (cur) {
    where.push('(taken_at < ? OR (taken_at = ? AND id < ?))')
    args.push(cur.key, cur.key, cur.id)
  }
  const rows = db()
    .prepare(`SELECT * FROM photos WHERE ${where.join(' AND ')} ORDER BY taken_at DESC, id DESC LIMIT ?`)
    .all(...args, q.limit + 1) as PhotoRow[]
  const more = rows.length > q.limit
  const page = more ? rows.slice(0, q.limit) : rows
  const items = page.map(rowToItem)
  attachAlbumIds(items)
  const last = page[page.length - 1]
  return { items, nextCursor: more && last ? makeCursor(last.taken_at, last.id) : null }
}

/** Recently deleted, newest deletion first; keyset on (trashed_at, id). */
export function listTrash(cursor: string | null, limit: number): PhotoPage {
  const cur = cursor ? parseCursor(cursor) : null
  const rows = (cur
    ? db().prepare(`SELECT * FROM photos WHERE trashed_at IS NOT NULL
                      AND (trashed_at < ? OR (trashed_at = ? AND id < ?))
                    ORDER BY trashed_at DESC, id DESC LIMIT ?`).all(cur.key, cur.key, cur.id, limit + 1)
    : db().prepare(`SELECT * FROM photos WHERE trashed_at IS NOT NULL
                    ORDER BY trashed_at DESC, id DESC LIMIT ?`).all(limit + 1)) as PhotoRow[]
  const more = rows.length > limit
  const page = more ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  return {
    items: page.map(rowToItem),
    nextCursor: more && last?.trashed_at != null ? makeCursor(last.trashed_at, last.id) : null,
  }
}

function attachAlbumIds(items: PhotoItem[]): void {
  if (items.length === 0) return
  const placeholders = items.map(() => '?').join(',')
  const rows = db()
    .prepare(`SELECT photo_id, album_id FROM album_items WHERE photo_id IN (${placeholders})`)
    .all(...items.map(i => i.id)) as { photo_id: string; album_id: string }[]
  if (rows.length === 0) return
  const byPhoto = new Map<string, string[]>()
  for (const r of rows) {
    const list = byPhoto.get(r.photo_id)
    if (list) list.push(r.album_id)
    else byPhoto.set(r.photo_id, [r.album_id])
  }
  for (const item of items) {
    const ids = byPhoto.get(item.id)
    if (ids) item.albumIds = ids
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface SummaryCounts {
  total: number
  images: number
  videos: number
  favorites: number
  trashCount: number
  libraryBytes: number
  trashBytes: number
  years: PhotoYearCount[]
  months: PhotoMonthCount[]
}

export function getSummaryCounts(): SummaryCounts {
  const d = db()
  const t = d.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN trashed_at IS NULL THEN 1 END), 0)                        AS total,
      COALESCE(SUM(CASE WHEN trashed_at IS NULL AND kind = 'image' THEN 1 END), 0)     AS images,
      COALESCE(SUM(CASE WHEN trashed_at IS NULL AND kind = 'video' THEN 1 END), 0)     AS videos,
      COALESCE(SUM(CASE WHEN trashed_at IS NULL AND favorite = 1 THEN 1 END), 0)       AS favorites,
      COALESCE(SUM(CASE WHEN trashed_at IS NOT NULL THEN 1 END), 0)                    AS trashCount,
      COALESCE(SUM(CASE WHEN trashed_at IS NULL THEN size END), 0)                     AS libraryBytes,
      COALESCE(SUM(CASE WHEN trashed_at IS NOT NULL AND rel_path NOT LIKE '.missing/%' THEN size END), 0) AS trashBytes
    FROM photos
  `).get() as Omit<SummaryCounts, 'years' | 'months'>
  const months = d.prepare(`
    SELECT CAST(strftime('%Y', taken_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS year,
           CAST(strftime('%m', taken_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS month,
           COUNT(*) AS count
    FROM photos WHERE trashed_at IS NULL
    GROUP BY year, month ORDER BY year DESC, month DESC
  `).all() as PhotoMonthCount[]
  const yearMap = new Map<number, number>()
  for (const m of months) yearMap.set(m.year, (yearMap.get(m.year) ?? 0) + m.count)
  const years = [...yearMap].map(([year, count]) => ({ year, count }))
  return { ...t, years, months }
}

export function getLastScan(): number | null {
  const v = getSetting('photos.lastScan')
  const n = v ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

export function setLastScan(ts: number): void {
  setSetting('photos.lastScan', String(ts))
}

// ── Mutations used by scan / store ────────────────────────────────────────────

export function insertPhoto(p: PhotoInsert): void {
  db().prepare(`
    INSERT INTO photos (id, rel_path, kind, size, mtime, hash, taken_at, width, height, duration,
                        mime, camera, lat, lon, favorite, trashed_at, indexed_at)
    VALUES (@id, @rel_path, @kind, @size, @mtime, @hash, @taken_at, @width, @height, @duration,
            @mime, @camera, @lat, @lon, 0, NULL, @indexed_at)
  `).run(p)
}

/** Refresh file facts + metadata of an existing row (keeps favorite / albums). */
export function updatePhotoFile(p: PhotoInsert): void {
  db().prepare(`
    UPDATE photos SET rel_path = @rel_path, kind = @kind, size = @size, mtime = @mtime, hash = @hash,
      taken_at = @taken_at, width = @width, height = @height, duration = @duration, mime = @mime,
      camera = @camera, lat = @lat, lon = @lon, trashed_at = NULL, indexed_at = @indexed_at
    WHERE id = @id
  `).run(p)
}

/** A file reappeared elsewhere (moved, or the share came back): re-point the row. */
export function relinkPhoto(id: string, relPath: string, mtime: number): void {
  db().prepare('UPDATE photos SET rel_path = ?, mtime = ?, trashed_at = NULL, indexed_at = ? WHERE id = ?')
    .run(relPath, mtime, Date.now(), id)
}

export interface LiveFileRow { id: string; rel_path: string; size: number; mtime: number; hash: string | null }

export function getLiveFileRows(): LiveFileRow[] {
  return db()
    .prepare('SELECT id, rel_path, size, mtime, hash FROM photos WHERE trashed_at IS NULL')
    .all() as LiveFileRow[]
}

export function countLiveRows(): number {
  return (db().prepare('SELECT COUNT(*) AS n FROM photos WHERE trashed_at IS NULL').get() as { n: number }).n
}

/** Rows trashed because their file vanished — candidates to revive by hash. */
export function getMissingRowsByHash(): Map<string, LiveFileRow> {
  const rows = db()
    .prepare(`SELECT id, rel_path, size, mtime, hash FROM photos
              WHERE trashed_at IS NOT NULL AND rel_path LIKE '.missing/%' AND hash IS NOT NULL`)
    .all() as LiveFileRow[]
  return new Map(rows.map(r => [`${r.size}:${r.hash}`, r]))
}

export function markMissing(id: string, relPath: string, now: number): void {
  // `.missing/<id>/<old path>` keeps rel_path UNIQUE even if the same path goes missing twice.
  db().prepare('UPDATE photos SET rel_path = ?, trashed_at = ? WHERE id = ?')
    .run(`${MISSING_PREFIX}${id}/${relPath}`, now, id)
}

export function findLiveByHash(hash: string, size: number): PhotoRow | null {
  return (db()
    .prepare('SELECT * FROM photos WHERE hash = ? AND size = ? AND trashed_at IS NULL LIMIT 1')
    .get(hash, size) as PhotoRow | undefined) ?? null
}

export function relPathTaken(relPath: string): boolean {
  return !!db().prepare('SELECT 1 FROM photos WHERE rel_path = ?').get(relPath)
}

export function setTrashed(id: string, relPath: string, trashedAt: number | null): void {
  db().prepare('UPDATE photos SET rel_path = ?, trashed_at = ? WHERE id = ?').run(relPath, trashedAt, id)
}

export function deletePhotoRow(id: string): void {
  const d = db()
  d.transaction(() => {
    d.prepare('DELETE FROM album_items WHERE photo_id = ?').run(id)
    d.prepare('UPDATE albums SET cover_id = NULL WHERE cover_id = ?').run(id)
    d.prepare('DELETE FROM photos WHERE id = ?').run(id)
  })()
}

export function getTrashedRows(): PhotoRow[] {
  return db().prepare('SELECT * FROM photos WHERE trashed_at IS NOT NULL').all() as PhotoRow[]
}

export function setFavorite(id: string, favorite: boolean): boolean {
  return db().prepare('UPDATE photos SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id).changes > 0
}

/** Live rows that may still need a grid thumbnail, newest first. */
export function getThumbCandidates(): { id: string; mtime: number }[] {
  return db()
    .prepare('SELECT id, mtime FROM photos WHERE trashed_at IS NULL ORDER BY taken_at DESC')
    .all() as { id: string; mtime: number }[]
}

// ── Albums ────────────────────────────────────────────────────────────────────

interface AlbumRow { id: string; name: string; created_at: number; cover_id: string | null; count: number; newest: string | null }

const ALBUM_SELECT = `
  SELECT a.id, a.name, a.created_at, a.cover_id,
    (SELECT COUNT(*) FROM album_items ai JOIN photos p ON p.id = ai.photo_id
      WHERE ai.album_id = a.id AND p.trashed_at IS NULL) AS count,
    (SELECT p.id FROM album_items ai JOIN photos p ON p.id = ai.photo_id
      WHERE ai.album_id = a.id AND p.trashed_at IS NULL ORDER BY p.taken_at DESC, p.id DESC LIMIT 1) AS newest,
    (SELECT 1 FROM album_items ai JOIN photos p ON p.id = ai.photo_id
      WHERE ai.album_id = a.id AND ai.photo_id = a.cover_id AND p.trashed_at IS NULL) AS cover_ok
  FROM albums a`

function albumFromRow(r: AlbumRow & { cover_ok: number | null }): Album {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    coverId: r.cover_ok ? r.cover_id : r.newest,
    count: r.count,
  }
}

export function listAlbums(): Album[] {
  const rows = db().prepare(`${ALBUM_SELECT} ORDER BY a.created_at DESC`).all() as (AlbumRow & { cover_ok: number | null })[]
  return rows.map(albumFromRow)
}

export function getAlbum(id: string): Album | null {
  const r = db().prepare(`${ALBUM_SELECT} WHERE a.id = ?`).get(id) as (AlbumRow & { cover_ok: number | null }) | undefined
  return r ? albumFromRow(r) : null
}

export function albumExists(id: string): boolean {
  return !!db().prepare('SELECT 1 FROM albums WHERE id = ?').get(id)
}

export function createAlbum(name: string, photoIds: string[] = [], id: string = newId(), createdAt = Date.now()): string {
  const d = db()
  d.transaction(() => {
    d.prepare('INSERT INTO albums (id, name, created_at, cover_id) VALUES (?, ?, ?, NULL)').run(id, name, createdAt)
    addAlbumItemsTx(id, photoIds)
  })()
  return id
}

export function updateAlbum(id: string, patch: { name?: string; coverId?: string | null }): boolean {
  const d = db()
  let changed = false
  d.transaction(() => {
    if (patch.name !== undefined) {
      changed = d.prepare('UPDATE albums SET name = ? WHERE id = ?').run(patch.name, id).changes > 0 || changed
    }
    if (patch.coverId !== undefined) {
      changed = d.prepare('UPDATE albums SET cover_id = ? WHERE id = ?').run(patch.coverId, id).changes > 0 || changed
    }
  })()
  return changed
}

export function deleteAlbum(id: string): boolean {
  const d = db()
  let changed = false
  d.transaction(() => {
    d.prepare('DELETE FROM album_items WHERE album_id = ?').run(id)
    changed = d.prepare('DELETE FROM albums WHERE id = ?').run(id).changes > 0
  })()
  return changed
}

function addAlbumItemsTx(albumId: string, photoIds: string[]): number {
  const d = db()
  const exists = d.prepare('SELECT 1 FROM photos WHERE id = ?')
  const ins = d.prepare('INSERT OR IGNORE INTO album_items (album_id, photo_id, added_at) VALUES (?, ?, ?)')
  const now = Date.now()
  let n = 0
  for (const pid of photoIds) {
    if (!exists.get(pid)) continue
    n += ins.run(albumId, pid, now).changes
  }
  return n
}

export function addAlbumItems(albumId: string, photoIds: string[]): number {
  const d = db()
  return d.transaction(() => addAlbumItemsTx(albumId, photoIds))()
}

export function removeAlbumItems(albumId: string, photoIds: string[]): number {
  const d = db()
  return d.transaction(() => {
    const del = d.prepare('DELETE FROM album_items WHERE album_id = ? AND photo_id = ?')
    let n = 0
    for (const pid of photoIds) n += del.run(albumId, pid).changes
    d.prepare(`UPDATE albums SET cover_id = NULL WHERE id = ? AND cover_id IS NOT NULL
               AND cover_id NOT IN (SELECT photo_id FROM album_items WHERE album_id = ?)`).run(albumId, albumId)
    return n
  })()
}

export function photoInAlbum(albumId: string, photoId: string): boolean {
  return !!db().prepare('SELECT 1 FROM album_items WHERE album_id = ? AND photo_id = ?').get(albumId, photoId)
}

// ── Catalog support ───────────────────────────────────────────────────────────

export interface CatalogSnapshot {
  favorites: string[]
  albums: { id: string; name: string; createdAt: number; cover: string | null; items: string[] }[]
}

/** Favorites + albums keyed by rel_path, live rows only. */
export function getCatalogSnapshot(): CatalogSnapshot {
  const d = db()
  const favorites = (d.prepare(`SELECT rel_path FROM photos WHERE favorite = 1 AND trashed_at IS NULL ORDER BY rel_path`)
    .all() as { rel_path: string }[]).map(r => r.rel_path)
  const albumRows = d.prepare(`
    SELECT a.id, a.name, a.created_at, p.rel_path AS cover
    FROM albums a LEFT JOIN photos p ON p.id = a.cover_id AND p.trashed_at IS NULL
    ORDER BY a.created_at, a.id`).all() as { id: string; name: string; created_at: number; cover: string | null }[]
  const itemStmt = d.prepare(`
    SELECT p.rel_path FROM album_items ai JOIN photos p ON p.id = ai.photo_id
    WHERE ai.album_id = ? AND p.trashed_at IS NULL ORDER BY p.rel_path`)
  const albums = albumRows.map(a => ({
    id: a.id,
    name: a.name,
    createdAt: a.created_at,
    cover: a.cover,
    items: (itemStmt.all(a.id) as { rel_path: string }[]).map(r => r.rel_path),
  }))
  return { favorites, albums }
}

/** True when there is no user state to lose (no albums, no favorites). */
export function catalogTablesEmpty(): boolean {
  const d = db()
  const albums = (d.prepare('SELECT COUNT(*) AS n FROM albums').get() as { n: number }).n
  const favs = (d.prepare('SELECT COUNT(*) AS n FROM photos WHERE favorite = 1').get() as { n: number }).n
  return albums === 0 && favs === 0
}

/** Apply a catalog to the index, matching by rel_path. Returns the number of rows touched. */
export function importCatalogSnapshot(snap: CatalogSnapshot): number {
  const d = db()
  const idByRel = d.prepare('SELECT id FROM photos WHERE rel_path = ? AND trashed_at IS NULL')
  const lookup = (rel: string): string | null => (idByRel.get(rel) as { id: string } | undefined)?.id ?? null
  const setFav = d.prepare('UPDATE photos SET favorite = 1 WHERE id = ?')
  let touched = 0
  d.transaction(() => {
    for (const rel of snap.favorites) {
      const id = lookup(rel)
      if (id) touched += setFav.run(id).changes
    }
    for (const a of snap.albums) {
      const albumId = /^[0-9a-f]{16}$/.test(a.id) && !albumExists(a.id) ? a.id : newId()
      const ids = a.items.map(lookup).filter((x): x is string => x !== null)
      createAlbum(a.name, [], albumId, a.createdAt)
      touched += addAlbumItemsTx(albumId, ids)
      const coverId = a.cover ? lookup(a.cover) : null
      if (coverId && ids.includes(coverId)) d.prepare('UPDATE albums SET cover_id = ? WHERE id = ?').run(coverId, albumId)
    }
  })()
  return touched
}

export function getPhotoRowByRel(relPath: string): PhotoRow | null {
  return (db().prepare('SELECT * FROM photos WHERE rel_path = ?').get(relPath) as PhotoRow | undefined) ?? null
}
