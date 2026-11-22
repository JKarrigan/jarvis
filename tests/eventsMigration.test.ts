import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, describe, expect, it } from 'vitest'

// A database written before events kept a trace (the schema the Pi has today).
const dir = mkdtempSync(path.join(tmpdir(), 'ag-events-old-'))
const file = path.join(dir, 'old.db')
const old = new Database(file)
old.exec(`
  CREATE TABLE events (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, severity TEXT NOT NULL, start_time INTEGER NOT NULL, end_time INTEGER,
    duration_minutes REAL NOT NULL, peak TEXT NOT NULL, baseline TEXT NOT NULL, title TEXT NOT NULL,
    description TEXT NOT NULL, recommendation TEXT, confidence REAL NOT NULL,
    acknowledged INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  );
`)
old.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
  'fuel_vapor_1', 'fuel_vapor', 'critical', 1_000_000, 2_000_000, 16.7,
  JSON.stringify({ noxIndex: 1, tvocIndex: 480, pm02: 5, rco2: 800 }),
  JSON.stringify({ noxIndex: 1, tvocIndex: 90, pm02: 2, rco2: 700 }),
  'Fuel vapor detected', 'old text', 'Check for fuel leaks or spills.', 0.85, 0, 1,
)
old.close()
process.env.DB_PATH = file

afterAll(async () => {
  (await import('@/lib/db')).getDb().close()
  rmSync(dir, { recursive: true, force: true })
})

describe('events table from an older version', () => {
  it('gains the trace column and keeps its rows', async () => {
    const db = await import('@/lib/db')
    const columns = (db.getDb().prepare('PRAGMA table_info(events)').all() as { name: string }[]).map(c => c.name)
    expect(columns).toContain('trace')
    expect(columns).toContain('sustained')
    const event = db.getEventById('fuel_vapor_1')!
    expect(event.title).toBe('Fuel vapor detected')
    expect(event.trace).toBeNull()
    expect('sustained' in event).toBe(false)
    expect('sustained' in db.getEvents()[0]).toBe(false)

    expect(db.refreshStoredEvents()).toBe(1)
    expect(db.getEventById('fuel_vapor_1')).toMatchObject({ severity: 'notable', title: 'VOC rise' })
    // No readings: the trace is marked as unavailable once.
    expect(db.backfillEventTraces()).toBe(1)
    expect(db.backfillEventTraces()).toBe(0)
  })

  it('gains the five-minute rollup table', async () => {
    const db = await import('@/lib/db')
    const columns = (db.getDb().prepare('PRAGMA table_info(readings_5m)').all() as { name: string; pk: number }[])
    expect(columns.find(c => c.pk === 1)?.name).toBe('bucket')
    const names = columns.map(c => c.name)
    expect(names).toEqual(expect.arrayContaining(['n', 't_avg', 'rco2_avg', 'rco2_min', 'rco2_max', 'pm02Compensated_max', 'wifi_avg']))
    expect(names).toHaveLength(3 + 13 * 3)
    expect(db.getLastRollupBucket()).toBeNull()
  })
})
