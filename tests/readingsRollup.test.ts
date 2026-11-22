import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { computeAqi } from '@/lib/aqi'
import type { HistoryEntry } from '@/lib/types'

// lib/db.ts reads DB_PATH when it is first imported, so import it after setting it.
const dir = mkdtempSync(path.join(tmpdir(), 'ag-rollup-'))
process.env.DB_PATH = path.join(dir, 'test.db')
let db: typeof import('@/lib/db')
let daily: typeof import('@/lib/dailySummary')

beforeAll(async () => {
  db = await import('@/lib/db')
  daily = await import('@/lib/dailySummary')
})
afterAll(() => {
  db.getDb().close()
  rmSync(dir, { recursive: true, force: true })
})

const caches = globalThis as typeof globalThis & Record<'__ag_histBuckets' | '__ag_histMinutes' | '__ag_daily5m', unknown>
beforeEach(() => {
  db.getDb().exec('DELETE FROM readings; DELETE FROM readings_5m')
  // Finished buckets are cached per process; each test writes its own data.
  delete caches.__ag_histBuckets
  delete caches.__ag_histMinutes
  delete caches.__ag_daily5m
})

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const FIVE = 5 * MIN
const T0 = Date.UTC(2026, 9, 1) // a multiple of five minutes

const FIELDS = [
  'rco2', 'pm01', 'pm02', 'pm10', 'pm02Compensated', 'pm003Count',
  'atmp', 'atmpCompensated', 'rhum', 'rhumCompensated', 'tvocIndex', 'noxIndex', 'wifi',
] as const

type Measures = Partial<Record<typeof FIELDS[number], number>> & { pm02: number; rco2: number }
interface Row { t: number; m: Measures }

function insert(rows: Row[]): void {
  const stmt = db.getDb().prepare('INSERT INTO readings (timestamp, data) VALUES (?, ?)')
  db.getDb().transaction(() => {
    for (const r of rows) stmt.run(r.t, JSON.stringify({ serialno: 'test', ...r.m }))
  })()
}

type RollupRow = { bucket: number; n: number; t_avg: number } & Record<string, number | null>
function rollupRows(): RollupRow[] {
  return db.getDb().prepare('SELECT * FROM readings_5m ORDER BY bucket').all() as RollupRow[]
}

/** Deterministic pseudo-random numbers in [0, 1). */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Readings every 10 s (with jitter) over [from, to), a gap, and
 * `pm02Compensated` / `atmpCompensated` only from `compensatedFrom` on.
 */
function series(from: number, to: number, opts: { gap?: [number, number]; compensatedFrom?: number; seed?: number } = {}): Row[] {
  const rand = rng(opts.seed ?? 1)
  const rows: Row[] = []
  for (let t = from; t < to; t += 10 * SEC) {
    if (opts.gap && t >= opts.gap[0] && t < opts.gap[1]) continue
    const ts = t + Math.floor(rand() * 3 * SEC)
    const pm = Math.round((4 + 40 * rand() ** 6) * 10) / 10
    const m: Measures = {
      rco2: Math.round(450 + 600 * rand()),
      pm01: pm * 0.7, pm02: pm, pm10: pm * 1.3,
      pm003Count: Math.round(pm * 60),
      atmp: 20 + 3 * rand(), rhum: Math.round(40 + 10 * rand()),
      tvocIndex: Math.round(100 + 50 * rand()), noxIndex: 1, wifi: -60 - Math.round(10 * rand()),
    }
    if (opts.compensatedFrom == null || t >= opts.compensatedFrom) {
      m.pm02Compensated = Math.round(pm * 0.8 * 100) / 100
      m.atmpCompensated = m.atmp! - 1.5
      m.rhumCompensated = m.rhum! + 4
    }
    rows.push({ t: ts, m })
  }
  return rows
}

/** The raw aggregation of `rows` into buckets of `bucket` ms, computed independently of SQL. */
function oracle(rows: Row[], from: number, to: number, bucket: number): HistoryEntry[] {
  const firstIdx = Math.floor(from / bucket)
  const lastIdx = Math.floor(to / bucket)
  const acc = new Map<number, { n: number; tSum: number; f: Record<string, { sum: number; cnt: number; min: number; max: number }> }>()
  for (const r of rows) {
    const idx = Math.floor(r.t / bucket)
    if (idx < firstIdx || idx > lastIdx) continue
    let a = acc.get(idx)
    if (!a) acc.set(idx, (a = { n: 0, tSum: 0, f: {} }))
    a.n++
    a.tSum += r.t
    for (const f of FIELDS) {
      const v = r.m[f]
      if (typeof v !== 'number') continue
      const s = (a.f[f] ??= { sum: 0, cnt: 0, min: Infinity, max: -Infinity })
      s.sum += v
      s.cnt++
      s.min = Math.min(s.min, v)
      s.max = Math.max(s.max, v)
    }
  }
  return [...acc.entries()].sort((x, y) => x[0] - y[0]).map(([, a]) => {
    const measures: Record<string, number> = {}
    const min: Record<string, number> = {}
    const max: Record<string, number> = {}
    for (const [f, s] of Object.entries(a.f)) {
      measures[f] = s.sum / s.cnt
      min[f] = s.min
      max[f] = s.max
    }
    return { timestamp: a.tSum / a.n, measures, min, max } as unknown as HistoryEntry
  })
}

function expectSameHistory(actual: HistoryEntry[], expected: HistoryEntry[]): void {
  expect(actual.length).toBe(expected.length)
  actual.forEach((e, i) => {
    const x = expected[i]
    expect(Math.abs(e.timestamp - x.timestamp)).toBeLessThanOrEqual(1)
    expect(Object.keys(e.measures).sort()).toEqual(Object.keys(x.measures).sort())
    for (const [f, v] of Object.entries(x.measures)) expect(e.measures[f as 'rco2']).toBeCloseTo(v as number, 6)
    expect(e.min).toEqual(x.min)
    expect(e.max).toEqual(x.max)
  })
}

function rollAll(now: number, chunkMs?: number): number {
  let calls = 0
  for (;;) {
    calls++
    if (!db.rollupReadings(now, chunkMs).more) return calls
  }
}

describe('rollupReadings', () => {
  it('writes count, mean time, average, minimum and maximum per five minutes', () => {
    insert([
      { t: T0, m: { rco2: 400, pm02: 1, pm02Compensated: 2 } },
      { t: T0 + 10 * SEC, m: { rco2: 500, pm02: 2, pm02Compensated: 4 } },
      { t: T0 + 20 * SEC, m: { rco2: 600, pm02: 9 } }, // older firmware: no compensated value
      { t: T0 + FIVE + 30 * SEC, m: { rco2: 700, pm02: 3 } },
    ])
    const result = db.rollupReadings(T0 + 2 * FIVE + MIN)
    expect(result).toEqual({ written: 2, more: false, through: T0 + 2 * FIVE })
    const [a, b] = rollupRows()
    expect(a).toMatchObject({
      bucket: T0, n: 3, t_avg: T0 + 10 * SEC,
      rco2_avg: 500, rco2_min: 400, rco2_max: 600,
      pm02_avg: 4, pm02_min: 1, pm02_max: 9,
      pm02Compensated_avg: 3, pm02Compensated_min: 2, pm02Compensated_max: 4,
      atmp_avg: null, atmp_min: null, atmp_max: null,
    })
    expect(b).toMatchObject({ bucket: T0 + FIVE, n: 1, t_avg: T0 + FIVE + 30 * SEC, rco2_avg: 700, pm02Compensated_avg: null })
  })

  it('only writes buckets that ended at least 60 s ago', () => {
    insert([{ t: T0 + MIN, m: { rco2: 400, pm02: 1 } }, { t: T0 + FIVE + MIN, m: { rco2: 400, pm02: 1 } }])
    expect(db.rollupReadings(T0 + FIVE + 59 * SEC).written).toBe(0)
    expect(rollupRows()).toHaveLength(0)
    expect(db.rollupReadings(T0 + FIVE + MIN)).toEqual({ written: 1, more: false, through: T0 + FIVE })
    expect(rollupRows().map(r => r.bucket)).toEqual([T0])
    // The second bucket follows once it is complete.
    expect(db.rollupReadings(T0 + 2 * FIVE + MIN).written).toBe(1)
    expect(rollupRows().map(r => r.bucket)).toEqual([T0, T0 + FIVE])
  })

  it('is idempotent', () => {
    insert(series(T0, T0 + 2 * HOUR))
    const now = T0 + 3 * HOUR
    db.rollupReadings(now)
    const first = rollupRows()
    expect(first).toHaveLength(24)
    expect(db.rollupReadings(now).written).toBe(0)
    expect(rollupRows()).toEqual(first)
    // Re-summarising a range that is already stored writes the same rows.
    db.getDb().prepare('DELETE FROM readings_5m WHERE bucket >= ?').run(T0 + HOUR)
    db.rollupReadings(now)
    expect(rollupRows()).toEqual(first)
  })

  it('works through a backlog a day at a time and says when more remains', () => {
    const rows = series(T0, T0 + 3 * DAY)
    insert(rows)
    const now = T0 + 3 * DAY + HOUR
    const first = db.rollupReadings(now, DAY)
    expect(first.more).toBe(true)
    expect(first.through).toBe(T0 + DAY)
    expect(first.written).toBe(288)
    expect(db.getLastRollupBucket()).toBe(T0 + DAY - FIVE)
    const second = db.rollupReadings(now, DAY)
    expect(second).toMatchObject({ written: 288, more: true, through: T0 + 2 * DAY })
    expect(db.rollupReadings(now, DAY)).toMatchObject({ written: 288, more: false })
    const chunked = rollupRows()

    // Same rows as one pass over everything.
    db.getDb().exec('DELETE FROM readings_5m')
    db.rollupReadings(now, 10 * DAY)
    expect(rollupRows()).toEqual(chunked)
    expect(chunked.reduce((s, r) => s + r.n, 0)).toBe(rows.length)
  })

  it('writes no rows for buckets without readings, and skips long gaps', () => {
    insert([{ t: T0 + MIN, m: { rco2: 400, pm02: 1 } }, { t: T0 + 10 * FIVE + MIN, m: { rco2: 500, pm02: 2 } }])
    insert([{ t: T0 + 20 * DAY, m: { rco2: 600, pm02: 3 } }])
    // A day per call, but the empty 20 days take no extra calls.
    expect(rollAll(T0 + 21 * DAY, DAY)).toBe(2)
    expect(rollupRows().map(r => r.bucket)).toEqual([T0, T0 + 10 * FIVE, T0 + 20 * DAY])
  })
})

describe('getHistory', () => {
  it('reads long spans from the rollups, equal to averaging the raw readings, with an un-rolled tail and a gap', () => {
    const from = T0 + 7 * MIN
    const to = T0 + 4 * DAY
    const rows = series(T0, to, { gap: [T0 + DAY + 3 * HOUR, T0 + DAY + 8 * HOUR], compensatedFrom: T0 + DAY })
    insert(rows)
    // Summarised up to three hours before the end; the rest is raw only.
    rollAll(to - 3 * HOUR)
    const lastRolled = db.getLastRollupBucket()!
    expect(lastRolled).toBeLessThan(to - 3 * HOUR)

    // 4 days / 800 = 7.2 min → 10-minute buckets from the rollups.
    const history = db.getHistory(from, to)
    expectSameHistory(history, oracle(rows, from, to, 10 * MIN))
    expect(history.at(-1)!.timestamp).toBeGreaterThan(lastRolled + FIVE)
    // The gap stays a gap.
    expect(history.some(e => e.timestamp > T0 + DAY + 3 * HOUR + 10 * MIN && e.timestamp < T0 + DAY + 8 * HOUR - 10 * MIN)).toBe(false)
    // Older firmware rows (day 1) have no compensated fields at all.
    expect(history[0].measures.pm02Compensated).toBeUndefined()
    expect(history[0].min).not.toHaveProperty('pm02Compensated')

    // Nothing rolled up yet: the same answer from raw readings alone.
    db.getDb().exec('DELETE FROM readings_5m')
    expectSameHistory(db.getHistory(from, to), oracle(rows, from, to, 10 * MIN))
  })

  it('carries min and max on the raw-averaged path (6 h to ~3 days)', () => {
    const rows = series(T0, T0 + DAY)
    insert(rows)
    const now = T0 + DAY + HOUR
    db.rollupReadings(now) // not used by this path
    const history = db.getHistory(T0, T0 + DAY, 800, now)
    // 24 h / 800 = 108 s buckets, below five minutes: averaged from raw readings.
    expectSameHistory(history, oracle(rows, T0, T0 + DAY, 108 * SEC))
    // Served from the cache the second time, unchanged.
    expect(db.getHistory(T0, T0 + DAY, 800, now)).toEqual(history)
  })

  it('returns spans up to 6 h raw', () => {
    const rows = series(T0, T0 + 6 * HOUR)
    insert(rows)
    db.rollupReadings(T0 + 7 * HOUR)
    const history = db.getHistory(T0, T0 + 6 * HOUR)
    expect(history).toHaveLength(rows.length)
    expect(history[0].measures.serialno).toBe('test')
    expect(history.every(e => e.min === undefined && e.max === undefined)).toBe(true)
  })
})

describe('pruning', () => {
  const now = T0 + 500 * DAY

  it('drops rollups older than 400 days', () => {
    insert([{ t: now - 401 * DAY, m: { rco2: 400, pm02: 1 } }, { t: now - 399 * DAY, m: { rco2: 400, pm02: 1 } }])
    rollAll(now)
    expect(rollupRows()).toHaveLength(2)
    expect(db.pruneRollups(400 * DAY, now)).toBe(1)
    expect(rollupRows()).toHaveLength(1)
  })

  it('never deletes raw readings that are not rolled up yet', () => {
    const rows = series(now - 40 * DAY, now - 36 * DAY)
    insert(rows)
    // Nothing rolled up: nothing goes.
    expect(db.pruneReadings(30 * DAY, now)).toBe(0)

    // One day rolled up: only that day's readings go.
    db.rollupReadings(now, DAY)
    const rolledEnd = db.getLastRollupBucket()! + FIVE
    const removed = db.pruneReadings(30 * DAY, now)
    expect(removed).toBe(rows.filter(r => r.t < rolledEnd).length)
    expect(db.getReadingSpan()!.from).toBeGreaterThanOrEqual(rolledEnd)

    // Everything rolled up: everything older than 30 days goes.
    rollAll(now)
    expect(db.pruneReadings(30 * DAY, now)).toBe(rows.length - removed)
    expect(db.getReadingCount()).toBe(0)
  })

  it('keeps raw readings younger than 30 days even when they are rolled up', () => {
    insert(series(now - 2 * DAY, now - DAY))
    rollAll(now)
    expect(db.pruneReadings(30 * DAY, now)).toBe(0)
  })
})

describe('daily summary from rollups', () => {
  // The day the brief remembers: Nov 12 2026 in Anchorage (UTC-9), with an evening spike.
  const tz = 'America/Anchorage'
  const dayStart = Date.UTC(2026, 10, 12, 9)

  /** The previous computation over raw readings (app/api/daily-summary before the rollups). */
  function rawSummary(rows: { timestamp: number; pm: number }[]) {
    let sum = 0, n = 0, peakAqi = -1, aboveMs = 0
    rows.forEach(({ timestamp, pm }, i) => {
      const aqi = computeAqi(pm).value
      sum += aqi
      n++
      if (aqi > peakAqi) peakAqi = aqi
      if (aqi > 50) {
        const next = rows[i + 1]?.timestamp
        aboveMs += next != null ? Math.min(next - timestamp, 60_000) : 10_000
      }
    })
    return { avgAqi: Math.round(sum / n), peakAqi, hoursAbove: Math.round(aboveMs / 360_000) / 10 }
  }

  it('is within 2 AQI points of the raw computation', () => {
    const rand = rng(7)
    const rows: Row[] = []
    for (let t = dayStart; t < dayStart + DAY; t += 10 * SEC) {
      const hour = (t - dayStart) / HOUR
      const cooking = hour >= 18 && hour < 19.5 ? 180 * Math.exp(-(((hour - 18.4) * 3) ** 2)) : 0
      // A clean baseline (AQI under 50) and one cooking spike well into "unhealthy".
      const pm = 2 + 4 * Math.sin(hour / 3) ** 2 + cooking + 2 * rand()
      rows.push({ t, m: { rco2: 600, pm02: pm + 2, pm02Compensated: pm } })
    }
    insert(rows)
    rollAll(dayStart + DAY + HOUR)

    const days = daily.summarizeDays(db.getPmRollups(dayStart - DAY), daily.dayKeyFn(tz))
    expect(days).toHaveLength(1)
    const summary = daily.toSummary(days[0])
    const raw = rawSummary(rows.map(r => ({ timestamp: r.t, pm: r.m.pm02Compensated! })))
    expect(summary.date).toBe('2026-11-12')
    expect(Math.abs(summary.avgAqi - raw.avgAqi)).toBeLessThanOrEqual(2)
    expect(Math.abs(summary.peakAqi - raw.peakAqi)).toBeLessThanOrEqual(2)
    expect(Math.abs(summary.hoursAbove - raw.hoursAbove)).toBeLessThanOrEqual(0.2)
    expect(summary.peakTime).toBeGreaterThan(dayStart + 18 * HOUR)
    expect(summary.peakTime).toBeLessThan(dayStart + 19 * HOUR)

    // The cached per-zone path answers the same.
    const viaCache = daily.getDailySummaries(tz, dayStart + DAY + HOUR)
    expect(viaCache).toEqual([summary])
  })
})

describe('getRecentMinutes', () => {
  it('returns one-minute averages stamped with each minute’s last reading, the partial minute included', () => {
    const base = T0 + 10 * MIN
    insert([
      { t: base + 5 * SEC, m: { rco2: 401, pm02: 1.111 } },
      { t: base + 35 * SEC, m: { rco2: 402, pm02: 1.112 } },
      { t: base + 55 * SEC, m: { rco2: 404, pm02: 1.115 } },
      { t: base + MIN + 20 * SEC, m: { rco2: 500, pm02: 2 } },
      // Current minute, still filling.
      { t: base + 2 * MIN + 1 * SEC, m: { rco2: 600, pm02: 3.333333, atmp: 20.123456 } },
      { t: base + 2 * MIN + 11 * SEC, m: { rco2: 601, pm02: 3.333333 } },
    ])
    const now = base + 2 * MIN + 15 * SEC
    const minutes = db.getRecentMinutes(600, now)
    expect(minutes.map(e => e.timestamp)).toEqual([base + 55 * SEC, base + MIN + 20 * SEC, base + 2 * MIN + 11 * SEC])
    expect(minutes[0].measures).toEqual({ rco2: 402.33, pm02: 1.11 })
    expect(minutes[2].measures).toEqual({ rco2: 600.5, pm02: 3.33, atmp: 20.12 })
    expect(minutes.every(e => e.min === undefined && e.max === undefined)).toBe(true)

    // The window counts back from the newest reading.
    expect(db.getRecentMinutes(2, now).map(e => e.timestamp)).toEqual([base + MIN + 20 * SEC, base + 2 * MIN + 11 * SEC])

    // The open minute is re-read; finished ones come from the cache.
    insert([{ t: base + 2 * MIN + 21 * SEC, m: { rco2: 602, pm02: 3 } }])
    const again = db.getRecentMinutes(600, base + 2 * MIN + 25 * SEC)
    expect(again.slice(0, 2)).toEqual(minutes.slice(0, 2))
    expect(again[2]).toMatchObject({ timestamp: base + 2 * MIN + 21 * SEC, measures: { rco2: 601 } })
  })

  it('is empty without readings', () => {
    expect(db.getRecentMinutes(600)).toEqual([])
  })
})
