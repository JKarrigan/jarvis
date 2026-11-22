import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runDetector } from '@/lib/eventDetection'
import type { AirQualityEvent, EventType } from '@/lib/eventTypes'

// lib/db.ts reads DB_PATH when it is first imported, so import it after setting it.
const dir = mkdtempSync(path.join(tmpdir(), 'ag-events-'))
process.env.DB_PATH = path.join(dir, 'test.db')
let db: typeof import('@/lib/db')

beforeAll(async () => { db = await import('@/lib/db') })
afterAll(() => {
  db.getDb().close()
  rmSync(dir, { recursive: true, force: true })
})
beforeEach(() => {
  db.getDb().exec('DELETE FROM events; DELETE FROM readings; DROP TABLE IF EXISTS events_premerge')
})

const MIN = 60_000
const T0 = Date.UTC(2026, 10, 20, 12, 0, 0)

function ev(type: EventType, startMin: number, endMin: number | null, extra: Partial<AirQualityEvent> = {}): AirQualityEvent {
  const startMs = T0 + startMin * MIN
  return {
    id: `${type}_${startMs}`,
    type,
    severity: 'notable',
    startTime: new Date(startMs),
    endTime: endMin == null ? null : new Date(T0 + endMin * MIN),
    durationMinutes: (endMin ?? startMin + 5) - startMin,
    peak: { noxIndex: 1, tvocIndex: 300, pm02: 5, rco2: 800 },
    baseline: { noxIndex: 1, tvocIndex: 100, pm02: 2, rco2: 600 },
    title: type,
    description: '',
    recommendation: null,
    confidence: 0.5,
    acknowledged: false,
    ...extra,
  }
}

function ids(): string[] {
  return db.getEvents({ limit: 1000 }).map(e => e.id).sort()
}

describe('mergeDuplicateEvents', () => {
  it('collapses one incident logged as a row per classification change', () => {
    db.upsertEvents([
      ev('voc_event', 0, 6),
      ev('fuel_vapor', 4, 20, { peak: { noxIndex: 1, tvocIndex: 480, pm02: 4, rco2: 700 } }),
      ev('voc_event', 18, 40, { acknowledged: true }),
      ev('combustion_exhaust', 38, 60, { peak: { noxIndex: 9, tvocIndex: 350, pm02: 130, rco2: 900 } }),
      ev('voc_event', 70, null), // 10 min after the last one ended: same incident, still open
      ev('voc_event', 200, 230), // a separate incident
      ev('ventilation_poor', 10, 90), // CO₂ is its own slot
    ])
    const result = db.mergeDuplicateEvents()
    expect(result).toEqual({ removed: 4, merged: 1 })

    const rows = db.getEvents({ limit: 1000 })
    expect(rows).toHaveLength(3)
    const incident = db.getEventById(`voc_event_${T0}`)!
    expect(incident.type).toBe('combustion_exhaust')
    expect(incident.severity).toBe('critical')
    expect(incident.endTime).toBeNull()
    // Only a notable part was dismissed; the merged incident is critical, so it alerts again.
    expect(incident.acknowledged).toBe(false)
    expect(incident.peak).toEqual({ noxIndex: 9, tvocIndex: 480, pm02: 130, rco2: 900 })
    expect(incident.title).toBe('Combustion fumes')

    const backup = db.getDb().prepare('SELECT COUNT(*) AS n FROM events_premerge').get() as { n: number }
    expect(backup.n).toBe(5)

    expect(db.mergeDuplicateEvents()).toEqual({ removed: 0, merged: 0 })
  })

  it('collapses rows written every 10 s for one CO₂ episode', () => {
    const rows: AirQualityEvent[] = []
    for (let i = 0; i < 50; i++) {
      const startMs = T0 + i * 10_000
      rows.push({ ...ev('ventilation_poor', 0, 8), id: `ventilation_poor_${startMs}`, startTime: new Date(startMs), endTime: new Date(startMs + 8 * MIN) })
    }
    db.upsertEvents(rows)
    expect(db.mergeDuplicateEvents().removed).toBe(49)
    expect(ids()).toEqual([`ventilation_poor_${T0}`])
    expect(db.getEventById(`ventilation_poor_${T0}`)!.endTime!.getTime()).toBe(T0 + 49 * 10_000 + 8 * MIN)
  })

  it('keeps the dismissal when a dismissed row was already as severe', () => {
    db.upsertEvents([
      ev('particulate_spike', 0, 20, { severity: 'warning', acknowledged: true, peak: { noxIndex: 1, tvocIndex: 150, pm02: 60, rco2: 700 } }),
      ev('voc_event', 18, 40),
    ])
    db.mergeDuplicateEvents()
    const incident = db.getEventById(`particulate_spike_${T0}`)!
    expect(incident.type).toBe('particulate_spike')
    expect(incident.severity).toBe('warning')
    expect(incident.acknowledged).toBe(true)
  })

  it('a VOC row merged with a smoky one becomes a particle spike at its severity', () => {
    db.upsertEvents([
      ev('voc_event', 0, 20, { peak: { noxIndex: 1, tvocIndex: 450, pm02: 20, rco2: 700 } }),
      ev('particulate_spike', 18, 40, { severity: 'critical', peak: { noxIndex: 1, tvocIndex: 150, pm02: 130, rco2: 700 } }),
    ])
    db.mergeDuplicateEvents()
    const incident = db.getEventById(`voc_event_${T0}`)!
    expect(incident.type).toBe('particulate_spike')
    expect(incident.severity).toBe('critical')
  })

  it('backs up rows with named columns', () => {
    db.upsertEvents([ev('voc_event', 0, 20), ev('voc_event', 10, 30)])
    db.mergeDuplicateEvents(123)
    const cols = (db.getDb().prepare('PRAGMA table_info(events_premerge)').all() as { name: string }[]).map(c => c.name)
    expect(cols.at(-1)).toBe('merged_at')
    expect(db.getDb().prepare('SELECT merged_at FROM events_premerge').all()).toEqual([{ merged_at: 123 }, { merged_at: 123 }])
  })

  it('leaves a clean table alone', () => {
    db.upsertEvents([ev('voc_event', 0, 20), ev('voc_event', 60, 80)])
    expect(db.mergeDuplicateEvents()).toEqual({ removed: 0, merged: 0 })
    expect(ids()).toHaveLength(2)
  })
})

describe('event writes', () => {
  it('updates the type of an open event whose classification escalated', () => {
    db.upsertEvents([ev('voc_event', 0, null)])
    db.upsertEvents([{ ...ev('voc_event', 0, null), type: 'fuel_vapor', severity: 'warning' }])
    expect(db.getEventById(`voc_event_${T0}`)!.type).toBe('fuel_vapor')
  })

  it('clears a dismissal when the event escalates, keeps it otherwise', () => {
    const id = `voc_event_${T0}`
    db.upsertEvents([ev('voc_event', 0, null, { severity: 'warning' })])
    db.acknowledgeEventInDb(id)
    db.upsertEvents([ev('voc_event', 0, null, { severity: 'warning', durationMinutes: 10 })])
    expect(db.getEventById(id)!.acknowledged).toBe(true)
    db.upsertEvents([ev('voc_event', 0, null, { type: 'combustion_exhaust', severity: 'critical' })])
    expect(db.getEventById(id)!.acknowledged).toBe(false)
  })

  it('reprocess carries a dismissal over to a re-detected event of another type in the same slot', () => {
    db.upsertEvents([
      ev('fuel_vapor', 1000, 1020, { severity: 'warning' }),
      ev('voc_event', 1020, 1040, { severity: 'warning', acknowledged: true }),
    ])
    db.replaceEvents([ev('fuel_vapor', 1000, 1040, { severity: 'warning' })], T0)
    expect(db.getEventById(`fuel_vapor_${T0 + 1000 * MIN}`)!.acknowledged).toBe(true)
  })

  it('reprocess keeps stored events from before the batch detector could evaluate', () => {
    // Readings start at minute 0: a fresh detector is blind for 33 minutes.
    db.upsertEvents([ev('voc_event', 10, 20), ev('voc_event', 100, 120)])
    db.replaceEvents([ev('voc_event', 101, 125)], T0)
    expect(ids()).toEqual([`voc_event_${T0 + 10 * MIN}`, `voc_event_${T0 + 101 * MIN}`])
  })

  it('an open batch event merged into an older row continues under the surviving id', () => {
    // Readings start at minute 1000; an incident from before them ended at 1040.
    db.upsertEvents([ev('fuel_vapor', 990, 1040, { severity: 'warning' })])
    const readings = []
    for (let ts = T0 + 1000 * MIN; ts < T0 + 1100 * MIN; ts += 10_000) {
      const fuel = ts >= T0 + 1050 * MIN
      readings.push({ timestamp: new Date(ts), pm02: fuel ? 4 : 2, rco2: 600, tvocIndex: fuel ? 400 : 100, noxIndex: 1, atmp: 21, rhum: 45 })
    }
    const { events, detector } = runDetector(readings)
    expect(events).toHaveLength(1)
    expect(events[0].endTime).toBeNull()
    db.replaceEvents(events, T0 + 1000 * MIN)
    db.mergeDuplicateEvents()
    const survivor = `fuel_vapor_${T0 + 990 * MIN}`
    expect(ids()).toEqual([survivor])
    // What replaceLiveDetector does after a reprocess:
    const active = detector.resume(db.getOpenEvents())
    db.reconcileOpenEvents(active)
    expect(active.map(e => e.id)).toEqual([survivor])
    const next = detector.push({ ...readings[readings.length - 1], timestamp: new Date(T0 + 1100 * MIN) })
    expect(next.every(c => c.event.id === survivor)).toBe(true)
    expect(db.getOpenEvents().map(e => e.id)).toEqual([survivor])
  })

  it('reprocess keeps events older than the stored readings', () => {
    db.upsertEvents([ev('voc_event', 0, 20), ev('voc_event', 1000, 1020, { acknowledged: true })])
    db.replaceEvents([ev('voc_event', 1001, 1030)], T0 + 500 * MIN)
    expect(ids()).toEqual([`voc_event_${T0}`, `voc_event_${T0 + 1001 * MIN}`])
    // The acknowledgement follows the overlapping re-detected event.
    expect(db.getEventById(`voc_event_${T0 + 1001 * MIN}`)!.acknowledged).toBe(true)
  })
})

describe('stored events follow the current rules', () => {
  it('re-derives type, severity and wording of rows written by older versions', () => {
    db.upsertEvents([
      ev('fuel_vapor', 0, 240, {
        severity: 'critical', title: 'Fuel vapor detected', description: 'VOC index spiked to 498.33 without a combustion signature.',
        recommendation: 'Check for fuel leaks or spills.', acknowledged: true,
        peak: { noxIndex: 1, tvocIndex: 498.33, pm02: 12, rco2: 800 },
      }),
      ev('voc_event', 300, 400, { severity: 'critical', peak: { noxIndex: 1, tvocIndex: 482, pm02: 226, rco2: 773 } }),
    ])
    expect(db.refreshStoredEvents()).toBe(2)

    const voc = db.getEventById(`fuel_vapor_${T0}`)!
    expect([voc.type, voc.severity, voc.title]).toEqual(['fuel_vapor', 'notable', 'VOC rise'])
    expect(voc.description).toContain('rose to 498,')
    expect(voc.acknowledged).toBe(true)
    const smoke = db.getEventById(`voc_event_${T0 + 300 * MIN}`)!
    expect([smoke.type, smoke.severity, smoke.title]).toEqual(['particulate_spike', 'critical', 'Particle spike'])

    expect(db.refreshStoredEvents()).toBe(0)
  })
})

describe('event traces', () => {
  /** One reading every 10 s from minute `from` to `to`; PM2.5 from `pm(minute)`. */
  function readings(from: number, to: number, pm: (minute: number) => number, co2 = 700) {
    const insert = db.getDb().prepare('INSERT INTO readings (timestamp, data) VALUES (?, ?)')
    db.getDb().transaction(() => {
      for (let ts = T0 + from * MIN; ts < T0 + to * MIN; ts += 10_000) {
        const minute = (ts - T0) / MIN
        insert.run(ts, JSON.stringify({ pm02: pm(minute), rco2: co2, tvocIndex: 100 + minute, noxIndex: 1, pm01: 1, pm10: 1, atmp: 21, rhum: 40 }))
      }
    })()
  }
  // 0–100: clean; 100–160 event: PM2.5 40, then 70 for minutes 120–140, peak 90 at minute 130.
  const pm = (m: number) => (m < 100 || m >= 160 ? 2 : m >= 130 && m < 130 + 1 / 6 ? 90 : m >= 120 && m < 140 ? 70 : 40)

  it('records buckets, peak times and minutes in each band', () => {
    readings(0, 200, pm)
    const trace = db.computeEventTrace(ev('particulate_spike', 100, 160))!
    expect(trace.from).toBe(T0 + 85 * MIN)
    expect(trace.stepMs).toBe(2 * MIN)
    expect(trace.pm02).toHaveLength(45)
    expect(trace.pm02[0]).toBe(2)          // before the event
    expect(trace.pm02[10]).toBe(40)        // minute 105
    expect(trace.pm02.at(-1)).toBe(2)      // after it
    expect(trace.peakAt.pm02).toBe(T0 + 130 * MIN)
    expect(trace.peakAt.tvocIndex).toBe(T0 + 160 * MIN)
    expect(trace.minutes.pmSensitive).toBeCloseTo(60, 0)
    expect(trace.minutes.pmUnhealthy).toBeCloseTo(20, 0)
    expect(trace.minutes.pmVeryUnhealthy).toBe(0)
    expect(trace.minutes.co2High).toBe(0)
  })

  it('is saved with a finished event, returned only on a single read, and dropped when the event changes', () => {
    readings(0, 200, pm)
    const event = ev('particulate_spike', 100, 160)
    db.upsertEvents([event])
    expect(db.getEventById(event.id)!.trace).toBeNull()
    expect(db.backfillEventTraces()).toBe(1)
    expect(db.getEventById(event.id)!.trace!.peakAt.pm02).toBe(T0 + 130 * MIN)
    expect('trace' in db.getEvents()[0]).toBe(false)
    expect(db.backfillEventTraces()).toBe(0)

    // The incident reopens: the saved trace no longer describes it.
    db.upsertEvents([{ ...event, endTime: null }])
    expect(db.getEventById(event.id)!.trace).toBeNull()
    expect(db.backfillEventTraces()).toBe(0) // open events are traced on demand
  })

  it('remembers that an old event has no readings left, and does not retry it', () => {
    readings(500, 600, () => 2)
    const old = ev('voc_event', 100, 160)
    db.upsertEvents([old])
    expect(db.computeEventTrace(old)).toBeNull()
    expect(db.backfillEventTraces()).toBe(1)
    expect(db.getEventById(old.id)!.trace).toBeNull()
    expect(db.backfillEventTraces()).toBe(0)
  })

  it('traces an event that is still going up to now', () => {
    readings(0, 130, pm)
    const trace = db.computeEventTrace(ev('particulate_spike', 100, null), T0 + 130 * MIN)!
    expect(trace.minutes.pmUnhealthy).toBeCloseTo(10, 0)
    expect(trace.from + trace.pm02.length * trace.stepMs).toBeGreaterThanOrEqual(T0 + 145 * MIN)
  })
})

describe('deleting and neighbours', () => {
  it('deletes a finished event and refuses one that is still going', () => {
    db.upsertEvents([ev('voc_event', 0, 20), ev('voc_event', 100, null)])
    expect(db.deleteEvent(`voc_event_${T0}`)).toBe('deleted')
    expect(db.deleteEvent(`voc_event_${T0}`)).toBe('missing')
    expect(db.deleteEvent(`voc_event_${T0 + 100 * MIN}`)).toBe('open')
    expect(ids()).toEqual([`voc_event_${T0 + 100 * MIN}`])
  })

  it('finds the events on either side in the log', () => {
    const [a, b, c] = [ev('voc_event', 0, 20), ev('ventilation_poor', 50, 90), ev('voc_event', 200, 220)]
    db.upsertEvents([a, b, c])
    expect(db.getEventNeighbours(b)).toEqual({ newerId: c.id, olderId: a.id })
    expect(db.getEventNeighbours(c)).toEqual({ newerId: null, olderId: b.id })
    expect(db.getEventNeighbours(a)).toEqual({ newerId: b.id, olderId: null })
  })
})
