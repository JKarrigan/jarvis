import 'server-only'
import Database from 'better-sqlite3'
import path from 'path'
import type { DeviceMeasures, HistoryEntry } from './types'
import type { AirGradientReading, AirQualityEvent } from './eventTypes'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'airgradient.db')

// Module-level singleton — re-used across hot reloads in dev via globalThis
const g = globalThis as typeof globalThis & { __ag_db?: Database.Database }

export function getDb(): Database.Database {
  if (!g.__ag_db) {
    const db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS readings (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        data      TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS readings_ts ON readings (timestamp);
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id               TEXT    PRIMARY KEY,
        type             TEXT    NOT NULL,
        severity         TEXT    NOT NULL,
        start_time       INTEGER NOT NULL,
        end_time         INTEGER,
        duration_minutes REAL    NOT NULL,
        peak             TEXT    NOT NULL,
        baseline         TEXT    NOT NULL,
        title            TEXT    NOT NULL,
        description      TEXT    NOT NULL,
        recommendation   TEXT,
        confidence       REAL    NOT NULL,
        acknowledged     INTEGER NOT NULL DEFAULT 0,
        created_at       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_start ON events (start_time);
    `)
    g.__ag_db = db
  }
  return g.__ag_db
}

// ─── Readings ────────────────────────────────────────────────────────────────

/** Numeric fields averaged when history is downsampled. */
const NUMERIC_FIELDS = [
  'rco2', 'pm01', 'pm02', 'pm10', 'pm02Compensated', 'pm003Count',
  'atmp', 'atmpCompensated', 'rhum', 'rhumCompensated', 'tvocIndex', 'noxIndex', 'wifi',
] as const

/** Spans up to this length are returned raw (≤ ~2 160 rows at 10 s polling). */
const RAW_SPAN_MS = 6 * 60 * 60 * 1000
/** Longer spans are averaged into at most this many buckets. */
export const MAX_HISTORY_POINTS = 800
const MIN_BUCKET_MS = 10_000

/**
 * Returns the payload as DeviceMeasures when it is a plain object with finite
 * numeric `pm02` and `rco2` (and every other known numeric field, when present,
 * is a finite number); otherwise null. Guards the readings table against
 * error bodies or junk, which would otherwise crash every consumer.
 */
export function validateMeasures(payload: unknown): DeviceMeasures | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const m = payload as Record<string, unknown>
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  if (!finite(m.pm02) || !finite(m.rco2)) return null
  for (const key of NUMERIC_FIELDS) {
    if (m[key] !== undefined && m[key] !== null && !finite(m[key])) return null
  }
  return m as unknown as DeviceMeasures
}

/** Inserts a validated reading. Returns false (and writes nothing) for invalid payloads. */
export function insertReading(timestamp: number, measures: unknown): boolean {
  const valid = validateMeasures(measures)
  if (!valid || !Number.isSafeInteger(timestamp)) return false
  getDb()
    .prepare('INSERT INTO readings (timestamp, data) VALUES (?, ?)')
    .run(timestamp, JSON.stringify(valid))
  return true
}

function parseRow(r: { timestamp: number; data: string }): HistoryEntry {
  return { timestamp: r.timestamp, measures: JSON.parse(r.data) as DeviceMeasures }
}

export function getRecentReadings(limit: number): HistoryEntry[] {
  const rows = getDb()
    .prepare('SELECT timestamp, data FROM readings ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as { timestamp: number; data: string }[]
  // Ascending so charts render left-to-right
  return rows.reverse().map(parseRow)
}

export function getReadingsByDateRange(from: number, to: number): HistoryEntry[] {
  const rows = getDb()
    .prepare('SELECT timestamp, data FROM readings WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC')
    .all(from, to) as { timestamp: number; data: string }[]
  return rows.map(parseRow)
}

/**
 * Downsampled buckets that are finished (their time span is entirely in the
 * past) never change, so they are cached per bucket size: a dashboard that
 * refreshes a 30-day chart every minute only re-aggregates the newest bucket(s)
 * instead of re-reading 259 k JSON rows each time. `null` marks an empty bucket.
 */
const gh = globalThis as typeof globalThis & { __ag_hist?: Map<number, Map<number, HistoryEntry | null>> }
const MAX_CACHED_BUCKET_SIZES = 8

function bucketCache(bucket: number): Map<number, HistoryEntry | null> {
  const all = (gh.__ag_hist ??= new Map())
  let m = all.get(bucket)
  if (!m) {
    if (all.size >= MAX_CACHED_BUCKET_SIZES) all.delete(all.keys().next().value as number)
    m = new Map()
    all.set(bucket, m)
  }
  return m
}

/**
 * History for [from, to]. Spans up to 6 h come back raw; longer spans are
 * averaged in SQL into buckets of max(10 s, span / 800), so at most ~800 points
 * are returned. Buckets are aligned to multiples of the bucket size (the first
 * one may start up to one bucket before `from`). A bucket's timestamp is the
 * mean timestamp of its rows (so gaps stay visible) and its measures hold the
 * average of each numeric field; non-numeric fields are omitted.
 */
export function getHistory(from: number, to: number, maxPoints = MAX_HISTORY_POINTS, now = Date.now()): HistoryEntry[] {
  const span = to - from
  if (span <= RAW_SPAN_MS) return getReadingsByDateRange(from, to)

  const bucket = Math.max(MIN_BUCKET_MS, Math.ceil(span / maxPoints))
  const firstIdx = Math.floor(from / bucket)
  const lastIdx = Math.floor(to / bucket)
  const isFinished = (idx: number) => (idx + 1) * bucket <= now
  const cache = bucketCache(bucket)

  // Re-query from the first bucket that is not cached (normally just the newest one).
  let queryIdx = firstIdx
  while (queryIdx <= lastIdx && isFinished(queryIdx) && cache.has(queryIdx)) queryIdx++

  const fresh = new Map<number, HistoryEntry>()
  if (queryIdx <= lastIdx) {
    const cols = NUMERIC_FIELDS.map(f => `AVG(json_extract(data, '$.${f}')) AS "${f}"`).join(',\n             ')
    const rows = getDb()
      .prepare(`
        SELECT CAST(timestamp / ? AS INTEGER) AS idx,
               CAST(AVG(timestamp) AS INTEGER) AS t,
               ${cols}
        FROM readings
        WHERE timestamp >= ? AND timestamp < ?
        -- better-sqlite3 binds JS numbers as REAL, so cast to get integer buckets
        GROUP BY CAST(timestamp / ? AS INTEGER)
      `)
      .all(bucket, queryIdx * bucket, (lastIdx + 1) * bucket, bucket) as ({ idx: number; t: number } & Record<string, number | null>)[]

    for (const r of rows) {
      const measures: Record<string, number> = {}
      for (const f of NUMERIC_FIELDS) {
        const v = r[f]
        if (typeof v === 'number' && Number.isFinite(v)) measures[f] = v
      }
      fresh.set(r.idx, { timestamp: r.t, measures: measures as unknown as DeviceMeasures })
    }
    for (let idx = queryIdx; idx <= lastIdx; idx++) {
      if (isFinished(idx)) cache.set(idx, fresh.get(idx) ?? null)
    }
    // Keep the cache to the window in use.
    for (const idx of cache.keys()) if (idx < firstIdx) cache.delete(idx)
  }

  const out: HistoryEntry[] = []
  for (let idx = firstIdx; idx <= lastIdx; idx++) {
    const e = idx >= queryIdx ? fresh.get(idx) : cache.get(idx)
    if (e) out.push(e)
  }
  return out
}

export function getLatestReading(): HistoryEntry | null {
  const row = getDb()
    .prepare('SELECT timestamp, data FROM readings ORDER BY timestamp DESC LIMIT 1')
    .get() as { timestamp: number; data: string } | undefined
  return row ? parseRow(row) : null
}

export function getLatestReadingTimestamp(): number | null {
  const row = getDb()
    .prepare('SELECT MAX(timestamp) AS t FROM readings')
    .get() as { t: number | null }
  return row.t
}

export function getReadingSpan(): { from: number; to: number } | null {
  const row = getDb()
    .prepare('SELECT MIN(timestamp) AS a, MAX(timestamp) AS b FROM readings')
    .get() as { a: number | null; b: number | null }
  return row.a != null && row.b != null ? { from: row.a, to: row.b } : null
}

export function getReadingCount(): number {
  return (getDb()
    .prepare('SELECT COUNT(*) as count FROM readings')
    .get() as { count: number }).count
}

/**
 * Streams the fields the event detector needs, oldest first, without parsing
 * whole JSON rows into objects. Iterating must finish before other statements
 * on the same connection run; callers that write should collect first or run
 * inside a transaction after iterating.
 */
export function* iterateDetectorReadings(from = 0, to = Number.MAX_SAFE_INTEGER): Generator<AirGradientReading> {
  const stmt = getDb().prepare(`
    SELECT timestamp,
           json_extract(data, '$.pm02') AS pm02,
           json_extract(data, '$.rco2') AS rco2,
           json_extract(data, '$.tvocIndex') AS tvocIndex,
           json_extract(data, '$.noxIndex') AS noxIndex,
           COALESCE(json_extract(data, '$.atmpCompensated'), json_extract(data, '$.atmp')) AS atmp,
           COALESCE(json_extract(data, '$.rhumCompensated'), json_extract(data, '$.rhum')) AS rhum
    FROM readings
    WHERE timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp ASC
  `)
  type Row = { timestamp: number; pm02: number; rco2: number; tvocIndex: number; noxIndex: number; atmp: number; rhum: number }
  for (const r of stmt.iterate(from, to) as IterableIterator<Row>) {
    yield {
      timestamp: new Date(r.timestamp),
      pm02: r.pm02,
      rco2: r.rco2,
      tvocIndex: r.tvocIndex,
      noxIndex: r.noxIndex,
      atmp: r.atmp,
      rhum: r.rhum,
    }
  }
}

/**
 * Timestamp + PM2.5 for the daily summary, preferring the firmware-compensated
 * value when the row has one.
 */
export function getPmSeries(from: number): { timestamp: number; pm: number | null }[] {
  return getDb()
    .prepare(`
      SELECT timestamp,
             COALESCE(json_extract(data, '$.pm02Compensated'), json_extract(data, '$.pm02')) AS pm
      FROM readings
      WHERE timestamp >= ?
      ORDER BY timestamp ASC
    `)
    .all(from) as { timestamp: number; pm: number | null }[]
}

export function pruneReadings(keepMs: number, now = Date.now()): number {
  return getDb().prepare('DELETE FROM readings WHERE timestamp < ?').run(now - keepMs).changes
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

// ─── Events ──────────────────────────────────────────────────────────────────

const UPSERT_EVENT_SQL = `
  INSERT INTO events (id, type, severity, start_time, end_time, duration_minutes, peak, baseline,
                      title, description, recommendation, confidence, acknowledged, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    severity         = excluded.severity,
    end_time         = excluded.end_time,
    duration_minutes = excluded.duration_minutes,
    peak             = excluded.peak,
    title            = excluded.title,
    description      = excluded.description,
    recommendation   = excluded.recommendation,
    confidence       = excluded.confidence,
    -- An acknowledgement is sticky: no writer can reset it to 0.
    acknowledged     = MAX(events.acknowledged, excluded.acknowledged)
`

function eventParams(event: AirQualityEvent, now: number): unknown[] {
  return [
    event.id,
    event.type,
    event.severity,
    event.startTime.getTime(),
    event.endTime?.getTime() ?? null,
    event.durationMinutes,
    JSON.stringify(event.peak),
    JSON.stringify(event.baseline),
    event.title,
    event.description,
    event.recommendation ?? null,
    event.confidence,
    event.acknowledged ? 1 : 0,
    now,
  ]
}

export function upsertEvent(event: AirQualityEvent): void {
  getDb().prepare(UPSERT_EVENT_SQL).run(...eventParams(event, Date.now()))
}

/** Upserts several events in one transaction. */
export function upsertEvents(events: AirQualityEvent[]): void {
  if (events.length === 0) return
  const db = getDb()
  const stmt = db.prepare(UPSERT_EVENT_SQL)
  const now = Date.now()
  db.transaction(() => {
    for (const e of events) stmt.run(...eventParams(e, now))
  })()
}

/**
 * Replaces every event with `events` atomically. Acknowledgements survive: a
 * new event is acknowledged when an event with the same id was, or when an
 * acknowledged event of the same type overlapped its time span (ids from
 * older detector versions differ).
 */
export function replaceAllEvents(events: AirQualityEvent[]): void {
  const db = getDb()
  const insert = db.prepare(UPSERT_EVENT_SQL)
  const now = Date.now()
  db.transaction(() => {
    const acked = db
      .prepare('SELECT id, type, start_time, end_time, duration_minutes FROM events WHERE acknowledged = 1')
      .all() as { id: string; type: string; start_time: number; end_time: number | null; duration_minutes: number }[]
    const ackedIds = new Set(acked.map(a => a.id))
    const isAcked = (e: AirQualityEvent) => {
      if (ackedIds.has(e.id)) return true
      const start = e.startTime.getTime()
      const end = e.endTime?.getTime() ?? now
      return acked.some(a => {
        const aEnd = a.end_time ?? a.start_time + a.duration_minutes * 60_000
        return a.type === e.type && a.start_time <= end && aEnd >= start
      })
    }
    db.prepare('DELETE FROM events').run()
    for (const e of events) insert.run(...eventParams({ ...e, acknowledged: e.acknowledged || isAcked(e) }, now))
  })()
}

interface EventRow {
  id: string; type: string; severity: string; start_time: number; end_time: number | null
  duration_minutes: number; peak: string; baseline: string; title: string; description: string
  recommendation: string | null; confidence: number; acknowledged: number
}

function rowToEvent(r: EventRow): AirQualityEvent {
  return {
    id: r.id,
    type: r.type as AirQualityEvent['type'],
    severity: r.severity as AirQualityEvent['severity'],
    startTime: new Date(r.start_time),
    endTime: r.end_time != null ? new Date(r.end_time) : null,
    durationMinutes: r.duration_minutes,
    peak: JSON.parse(r.peak),
    baseline: JSON.parse(r.baseline),
    title: r.title,
    description: r.description,
    recommendation: r.recommendation,
    confidence: r.confidence,
    acknowledged: r.acknowledged === 1,
  }
}

export function getEventById(id: string): AirQualityEvent | null {
  const row = getDb()
    .prepare('SELECT * FROM events WHERE id = ?')
    .get(id) as EventRow | undefined
  return row ? rowToEvent(row) : null
}

export interface EventQuery {
  limit?: number
  /** Only events that started at or after this time… */
  since?: number
  /** …or are still open (so a long-running event is never missed). */
  activeOnly?: boolean
}

export function getEvents({ limit = 200, since, activeOnly = false }: EventQuery = {}): AirQualityEvent[] {
  const where: string[] = []
  const args: unknown[] = []
  if (activeOnly) where.push('end_time IS NULL')
  if (since != null) {
    // Include events that started earlier but were still running at `since`.
    where.push('(start_time >= ? OR end_time IS NULL OR end_time >= ?)')
    args.push(since, since)
  }
  const sql = `SELECT * FROM events ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY start_time DESC LIMIT ?`
  const rows = getDb().prepare(sql).all(...args, limit) as EventRow[]
  return rows.map(rowToEvent)
}

export function getOpenEvents(): AirQualityEvent[] {
  return getEvents({ activeOnly: true, limit: 1000 })
}

/**
 * Closes open events that the live detector is not tracking (left behind by a
 * crash or an older client-side detector). The end time is the start plus the
 * last recorded duration.
 */
export function closeOrphanEvents(activeIds: string[]): number {
  const db = getDb()
  const placeholders = activeIds.map(() => '?').join(',')
  const sql = `
    UPDATE events
    SET end_time = start_time + CAST(duration_minutes * 60000 AS INTEGER)
    WHERE end_time IS NULL ${activeIds.length ? `AND id NOT IN (${placeholders})` : ''}
  `
  return db.prepare(sql).run(...activeIds).changes
}

/** Returns false when no event has that id. */
export function acknowledgeEventInDb(id: string): boolean {
  return getDb().prepare('UPDATE events SET acknowledged = 1 WHERE id = ?').run(id).changes > 0
}

/** Deletes closed events that started more than `keepMs` ago. */
export function pruneEvents(keepMs: number, now = Date.now()): number {
  return getDb()
    .prepare('DELETE FROM events WHERE start_time < ? AND end_time IS NOT NULL')
    .run(now - keepMs).changes
}
