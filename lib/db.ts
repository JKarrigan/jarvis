import Database from 'better-sqlite3'
import path from 'path'
import type { DeviceMeasures, HistoryEntry } from './types'

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
