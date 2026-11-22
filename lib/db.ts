import 'server-only'
import Database from 'better-sqlite3'
import path from 'path'
import type { DeviceMeasures, HistoryEntry } from './types'
import type { AirGradientReading, AirQualityEvent, EventTrace } from './eventTypes'
import { DETECTION_TIMING, SEVERITY_RANK, mergeEvents, rederiveEvent, slotOf } from './eventDetection'
import { SEVERITY_LIMITS } from './eventInfo'

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
        created_at       INTEGER NOT NULL,
        trace            TEXT
      );
      CREATE INDEX IF NOT EXISTS events_start ON events (start_time);
    `)
    // Databases created before events kept a trace.
    const eventColumns = db.prepare('PRAGMA table_info(events)').all() as { name: string }[]
    if (!eventColumns.some(c => c.name === 'trace')) db.exec('ALTER TABLE events ADD COLUMN trace TEXT')
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

function severityRankSql(column: string): string {
  const cases = Object.entries(SEVERITY_RANK).map(([sev, rank]) => `WHEN '${sev}' THEN ${rank}`).join(' ')
  return `(CASE ${column} ${cases} ELSE 0 END)`
}

const UPSERT_EVENT_SQL = `
  INSERT INTO events (id, type, severity, start_time, end_time, duration_minutes, peak, baseline,
                      title, description, recommendation, confidence, acknowledged, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    -- The type can escalate while an incident is open (the id keeps the onset type).
    type             = excluded.type,
    severity         = excluded.severity,
    end_time         = excluded.end_time,
    duration_minutes = excluded.duration_minutes,
    peak             = excluded.peak,
    title            = excluded.title,
    description      = excluded.description,
    recommendation   = excluded.recommendation,
    confidence       = excluded.confidence,
    -- Any write means the event changed; its trace is rebuilt when it closes.
    trace            = NULL,
    -- An acknowledgement is sticky while the event stays as severe as it was;
    -- escalating (say VOC → combustion) makes it alert again.
    acknowledged     = CASE
      WHEN ${severityRankSql('excluded.severity')} > ${severityRankSql('events.severity')} THEN excluded.acknowledged
      ELSE MAX(events.acknowledged, excluded.acknowledged)
    END
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
 * Replaces the stored events with those from a batch run over the readings
 * that start at `readingsFrom`. A fresh detector cannot evaluate until it has
 * a baseline and a window of readings, so only events starting after that
 * point are replaced; older events (including those whose readings have been
 * pruned) are kept, and `mergeDuplicateEvents` then joins any incident that
 * straddles the boundary. Atomic. Acknowledgements survive when an
 * acknowledged event of the same slot overlapped (or was within the merge
 * window of) the new one and was at least as severe; ids and types from
 * older detector versions differ.
 */
export function replaceEvents(events: AirQualityEvent[], readingsFrom: number): void {
  const db = getDb()
  const insert = db.prepare(UPSERT_EVENT_SQL)
  const now = Date.now()
  const from = readingsFrom + DETECTION_TIMING.BASELINE_WINDOW_MS + DETECTION_TIMING.SAMPLE_WINDOW_MS
  const margin = DETECTION_TIMING.MERGE_WINDOW_MS
  db.transaction(() => {
    const acked = (db
      .prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE acknowledged = 1 AND start_time >= ?`)
      .all(from) as EventRow[]).map(rowToEvent)
    const ackedIds = new Set(acked.map(a => a.id))
    const isAcked = (e: AirQualityEvent) => {
      if (ackedIds.has(e.id)) return true
      const start = e.startTime.getTime()
      const end = e.endTime?.getTime() ?? now
      return acked.some(a => {
        const aStart = a.startTime.getTime()
        const aEnd = a.endTime?.getTime() ?? aStart + a.durationMinutes * 60_000
        return slotOf(a.type) === slotOf(e.type) &&
          aStart <= end + margin && aEnd + margin >= start &&
          SEVERITY_RANK[a.severity] >= SEVERITY_RANK[e.severity]
      })
    }
    db.prepare('DELETE FROM events WHERE start_time >= ?').run(from)
    for (const e of events) {
      if (e.startTime.getTime() < from) continue
      insert.run(...eventParams({ ...e, acknowledged: e.acknowledged || isAcked(e) }, now))
    }
  })()
}

const EVENT_COLUMNS = 'id, type, severity, start_time, end_time, duration_minutes, peak, baseline, ' +
  'title, description, recommendation, confidence, acknowledged, created_at'

/**
 * Collapses stored rows that belong to one incident (`mergeEvents`: same
 * slot, overlapping or within the merge window) into the oldest row of each
 * group. Every row of a merged group is first copied, unchanged, into
 * `events_premerge` (with `merged_at`), so the cleanup can be inspected or
 * undone by hand. Idempotent; returns how many rows were removed.
 */
export function mergeDuplicateEvents(now = Date.now()): { removed: number; merged: number } {
  const db = getDb()
  return db.transaction(() => {
    const rows = (db.prepare(`SELECT ${EVENT_COLUMNS} FROM events`).all() as EventRow[]).map(rowToEvent)
    const { merged, removedIds } = mergeEvents(rows)
    if (removedIds.length === 0) return { removed: 0, merged: 0 }

    db.exec(`CREATE TABLE IF NOT EXISTS events_premerge AS SELECT ${EVENT_COLUMNS}, 0 AS merged_at FROM events WHERE 0`)
    const backup = db.prepare(`INSERT INTO events_premerge (${EVENT_COLUMNS}, merged_at) SELECT ${EVENT_COLUMNS}, ? FROM events WHERE id = ?`)
    const remove = db.prepare('DELETE FROM events WHERE id = ?')
    const update = db.prepare(`
      UPDATE events SET type = ?, severity = ?, end_time = ?, duration_minutes = ?, peak = ?,
                        title = ?, description = ?, recommendation = ?, confidence = ?, acknowledged = ?,
                        trace = NULL
      WHERE id = ?
    `)
    for (const id of [...merged.map(e => e.id), ...removedIds]) backup.run(now, id)
    for (const id of removedIds) remove.run(id)
    for (const e of merged) {
      update.run(
        e.type, e.severity, e.endTime?.getTime() ?? null, e.durationMinutes, JSON.stringify(e.peak),
        e.title, e.description, e.recommendation ?? null, e.confidence, e.acknowledged ? 1 : 0, e.id,
      )
    }
    return { removed: removedIds.length, merged: merged.length }
  })()
}

interface EventRow {
  id: string; type: string; severity: string; start_time: number; end_time: number | null
  duration_minutes: number; peak: string; baseline: string; title: string; description: string
  recommendation: string | null; confidence: number; acknowledged: number
  /** Only selected for a single event read. */
  trace?: string | null
}

function parseTrace(raw: string | null | undefined): EventTrace | null {
  if (!raw) return null
  try { return JSON.parse(raw) as EventTrace | null } catch { return null }
}

function rowToEvent(r: EventRow): AirQualityEvent {
  return {
    ...(r.trace !== undefined ? { trace: parseTrace(r.trace) } : {}),
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

/** One event, with its saved trace (lists leave the trace out). */
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
  const sql = `SELECT ${EVENT_COLUMNS} FROM events ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY start_time DESC LIMIT ?`
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

/**
 * After the live detector is (re)built: writes the events it is continuing
 * and closes every other open row, in one transaction.
 */
export function reconcileOpenEvents(active: AirQualityEvent[]): void {
  getDb().transaction(() => {
    upsertEvents(active)
    closeOrphanEvents(active.map(e => e.id))
  })()
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

/**
 * Deletes one finished event (a junk row, or one the user says was not real).
 * An event that is still going cannot be deleted: the detector would write
 * it again a minute later. Re-running detection brings a deleted event back
 * if the stored readings still show it.
 */
export function deleteEvent(id: string): 'deleted' | 'open' | 'missing' {
  const db = getDb()
  const row = db.prepare('SELECT end_time FROM events WHERE id = ?').get(id) as { end_time: number | null } | undefined
  if (!row) return 'missing'
  if (row.end_time == null) return 'open'
  db.prepare('DELETE FROM events WHERE id = ?').run(id)
  return 'deleted'
}

/** Ids of the events that started just after and just before this one. */
export function getEventNeighbours(event: AirQualityEvent): { newerId: string | null; olderId: string | null } {
  const db = getDb()
  const start = event.startTime.getTime()
  const newer = db
    .prepare('SELECT id FROM events WHERE (start_time > ? OR (start_time = ? AND id > ?)) ORDER BY start_time ASC, id ASC LIMIT 1')
    .get(start, start, event.id) as { id: string } | undefined
  const older = db
    .prepare('SELECT id FROM events WHERE (start_time < ? OR (start_time = ? AND id < ?)) ORDER BY start_time DESC, id DESC LIMIT 1')
    .get(start, start, event.id) as { id: string } | undefined
  return { newerId: newer?.id ?? null, olderId: older?.id ?? null }
}

/**
 * Rewrites the derived fields of stored events (type as `classifyEvent` sees
 * it, severity, title, description, recommendation) with the current rules.
 * Events are kept for 90 days but readings only for 30, so older rows cannot
 * be re-detected; this keeps them consistent with new ones. Idempotent;
 * returns how many rows changed.
 */
export function refreshStoredEvents(): number {
  const db = getDb()
  return db.transaction(() => {
    const rows = (db.prepare(`SELECT ${EVENT_COLUMNS} FROM events`).all() as EventRow[]).map(rowToEvent)
    const update = db.prepare(
      'UPDATE events SET type = ?, severity = ?, title = ?, description = ?, recommendation = ?, confidence = ? WHERE id = ?',
    )
    let changed = 0
    for (const e of rows) {
      const next = rederiveEvent(e)
      if (next.type === e.type && next.severity === e.severity && next.title === e.title &&
          next.description === e.description && next.recommendation === e.recommendation) continue
      update.run(next.type, next.severity, next.title, next.description, next.recommendation ?? null, next.confidence, e.id)
      changed++
    }
    return changed
  })()
}

// ─── Event traces ────────────────────────────────────────────────────────────

const TRACE_PAD_MS = 15 * 60 * 1000
const TRACE_POINTS = 60
const TRACE_FIELDS = ['pm02', 'tvocIndex', 'noxIndex', 'rco2'] as const

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * Builds the trace of an event from the stored readings (see `EventTrace`):
 * up to 60 averaged buckets from 15 minutes before it to 15 minutes after,
 * the time each reading peaked, and the minutes spent in each band. Returns
 * null when the readings no longer cover the start of the event.
 */
export function computeEventTrace(event: AirQualityEvent, now = Date.now()): EventTrace | null {
  const db = getDb()
  const start = event.startTime.getTime()
  const end = Math.max(start, event.endTime?.getTime() ?? now)
  const L = SEVERITY_LIMITS
  const stats = db.prepare(`
    SELECT COUNT(*) AS n, MIN(timestamp) AS first, MAX(timestamp) AS last,
      SUM(json_extract(data, '$.pm02') >= ?) AS pmS,
      SUM(json_extract(data, '$.pm02') >= ?) AS pmU,
      SUM(json_extract(data, '$.pm02') >= ?) AS pmV,
      SUM(json_extract(data, '$.rco2') >= ?) AS c1,
      SUM(json_extract(data, '$.rco2') >= ?) AS c2
    FROM readings WHERE timestamp >= ? AND timestamp <= ?
  `).get(L.pmSensitive, L.pmWarning, L.pmCritical, L.co2Warning, L.co2Critical, start, end) as {
    n: number; first: number | null; last: number | null
    pmS: number | null; pmU: number | null; pmV: number | null; c1: number | null; c2: number | null
  }
  if (!stats.n || stats.first == null || stats.last == null || stats.first > start + 5 * 60_000) return null

  // Minutes in a band = readings in it × the spacing between readings.
  const spacingMin = stats.n > 1 ? (stats.last - stats.first) / (stats.n - 1) / 60_000 : 1 / 6
  const minutes = (count: number | null) => round1((count ?? 0) * spacingMin)

  const peakAt = {} as EventTrace['peakAt']
  for (const field of TRACE_FIELDS) {
    const row = db.prepare(`
      SELECT timestamp FROM readings WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY json_extract(data, '$.${field}') DESC, timestamp ASC LIMIT 1
    `).get(start, end) as { timestamp: number }
    peakAt[field] = row.timestamp
  }

  const from = start - TRACE_PAD_MS
  const to = end + TRACE_PAD_MS
  const stepMs = Math.max(60_000, Math.ceil((to - from) / TRACE_POINTS / 60_000) * 60_000)
  const count = Math.ceil((to - from) / stepMs)
  const series = Object.fromEntries(TRACE_FIELDS.map(f => [f, new Array<number | null>(count).fill(null)])) as
    Record<typeof TRACE_FIELDS[number], (number | null)[]>
  const buckets = db.prepare(`
    SELECT (timestamp - ?) / ? AS b,
      AVG(json_extract(data, '$.pm02')) AS pm02, AVG(json_extract(data, '$.tvocIndex')) AS tvocIndex,
      AVG(json_extract(data, '$.noxIndex')) AS noxIndex, AVG(json_extract(data, '$.rco2')) AS rco2
    FROM readings WHERE timestamp >= ? AND timestamp < ? GROUP BY b
  `).all(from, stepMs, from, to) as ({ b: number } & Record<typeof TRACE_FIELDS[number], number | null>)[]
  for (const row of buckets) {
    if (row.b < 0 || row.b >= count) continue
    for (const f of TRACE_FIELDS) {
      const v = row[f]
      series[f][row.b] = v == null ? null : f === 'rco2' ? Math.round(v) : round1(v)
    }
  }

  return {
    from, stepMs, ...series, peakAt,
    minutes: {
      pmSensitive: minutes(stats.pmS), pmUnhealthy: minutes(stats.pmU), pmVeryUnhealthy: minutes(stats.pmV),
      co2High: minutes(stats.c1), co2VeryHigh: minutes(stats.c2),
    },
  }
}

/**
 * Computes and saves the trace of a finished event. When the readings are
 * gone the JSON value `null` is stored, so the row is not tried again.
 */
export function storeEventTrace(event: AirQualityEvent): EventTrace | null {
  const trace = computeEventTrace(event)
  getDb().prepare('UPDATE events SET trace = ? WHERE id = ? AND end_time IS NOT NULL').run(JSON.stringify(trace), event.id)
  return trace
}

/** Saves traces for up to `limit` finished events that have none yet, newest first. Returns how many it handled. */
export function backfillEventTraces(limit = 10): number {
  const rows = getDb()
    .prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE trace IS NULL AND end_time IS NOT NULL ORDER BY start_time DESC LIMIT ?`)
    .all(limit) as EventRow[]
  for (const row of rows) storeEventTrace(rowToEvent(row))
  return rows.length
}
