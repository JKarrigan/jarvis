import Database from 'better-sqlite3'
import path from 'path'
import type { DeviceMeasures, HistoryEntry } from './types'
import type { AirQualityEvent } from './eventTypes'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'airgradient.db')

// Module-level singleton — re-used across hot reloads in dev via globalThis
const g = globalThis as typeof globalThis & { __ag_db?: Database.Database }

function getDb(): Database.Database {
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

export function insertReading(timestamp: number, measures: DeviceMeasures): void {
  getDb()
    .prepare('INSERT INTO readings (timestamp, data) VALUES (?, ?)')
    .run(timestamp, JSON.stringify(measures))
}

export function getRecentReadings(limit: number): HistoryEntry[] {
  const rows = getDb()
    .prepare(
      'SELECT timestamp, data FROM readings ORDER BY timestamp DESC LIMIT ?'
    )
    .all(limit) as { timestamp: number; data: string }[]

  // Return in ascending order so charts render left-to-right
  return rows.reverse().map(r => ({
    timestamp: r.timestamp,
    measures: JSON.parse(r.data) as DeviceMeasures,
  }))
}

export function getReadingsByDateRange(from: number, to: number): HistoryEntry[] {
  const rows = getDb()
    .prepare('SELECT timestamp, data FROM readings WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC')
    .all(from, to) as { timestamp: number; data: string }[]
  return rows.map(r => ({ timestamp: r.timestamp, measures: JSON.parse(r.data) as DeviceMeasures }))
}

export function getLatestReading(): HistoryEntry | null {
  const row = getDb()
    .prepare('SELECT timestamp, data FROM readings ORDER BY timestamp DESC LIMIT 1')
    .get() as { timestamp: number; data: string } | undefined
  if (!row) return null
  return { timestamp: row.timestamp, measures: JSON.parse(row.data) as DeviceMeasures }
}

export function pruneOldReadings(keepMs: number): void {
  const cutoff = Date.now() - keepMs
  getDb().prepare('DELETE FROM readings WHERE timestamp < ?').run(cutoff)
}

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

export function upsertEvent(event: AirQualityEvent): void {
  getDb()
    .prepare(`
      INSERT INTO events (id, type, severity, start_time, end_time, duration_minutes, peak, baseline,
                          title, description, recommendation, confidence, acknowledged, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        severity         = excluded.severity,
        end_time         = excluded.end_time,
        duration_minutes = excluded.duration_minutes,
        peak             = excluded.peak,
        confidence       = excluded.confidence,
        acknowledged     = excluded.acknowledged
    `)
    .run(
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
      Date.now(),
    )
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

export function getEvents(limit = 200, since?: number): AirQualityEvent[] {
  const rows = since != null
    ? getDb()
        .prepare('SELECT * FROM events WHERE start_time >= ? ORDER BY start_time DESC LIMIT ?')
        .all(since, limit) as EventRow[]
    : getDb()
        .prepare('SELECT * FROM events ORDER BY start_time DESC LIMIT ?')
        .all(limit) as EventRow[]
  return rows.map(rowToEvent)
}

export function acknowledgeEventInDb(id: string): void {
  getDb().prepare('UPDATE events SET acknowledged = 1 WHERE id = ?').run(id)
}
