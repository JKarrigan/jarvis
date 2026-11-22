import { describe, expect, it } from 'vitest'
import { EventDetector, detectEvents, primeDetector } from '@/lib/eventDetection'
import type { AirGradientReading, AirQualityEvent } from '@/lib/eventTypes'

// ─── Reading sequences ───────────────────────────────────────────────────────

const STEP = 10_000
const MIN = 60_000
const HOUR = 60 * MIN
/** Minute-aligned start, like a real day of readings. */
const T0 = Date.UTC(2026, 10, 20, 12, 0, 0)

interface Level { pm02?: number; rco2?: number; tvocIndex?: number; noxIndex?: number }
const CLEAN: Required<Level> = { pm02: 2, rco2: 600, tvocIndex: 100, noxIndex: 1 }

/** One reading every 10 s, `minutes` long per segment, starting at T0. */
function sequence(...segments: [minutes: number, level: Level][]): AirGradientReading[] {
  const out: AirGradientReading[] = []
  let ts = T0
  for (const [minutes, level] of segments) {
    const end = ts + minutes * MIN
    for (; ts < end; ts += STEP) {
      out.push({ timestamp: new Date(ts), ...CLEAN, ...level, atmp: 21, rhum: 45 })
    }
  }
  return out
}

/** Alternates two levels every `every` minutes for `minutes`. */
function alternating(minutes: number, every: number, a: Level, b: Level): [number, Level][] {
  const out: [number, Level][] = []
  for (let m = 0; m < minutes; m += every) out.push([every, (m / every) % 2 === 0 ? a : b])
  return out
}

const VOC: Level = { tvocIndex: 300, pm02: 20 }             // voc_event (PM too high for fuel vapour)
const FUEL: Level = { tvocIndex: 400, pm02: 4 }             // fuel_vapor
const COMBUSTION: Level = { tvocIndex: 300, pm02: 40, noxIndex: 10, rco2: 900 }

// ─── Simulated live pipeline (poller + events table) ─────────────────────────

/**
 * Feeds readings one at a time like the poller and keeps an `events` table
 * keyed by id, exactly as `upsertEvents` would. `restartAt` simulates a
 * server restart before that reading index: the live detector is thrown away
 * and rebuilt the way lib/poller.ts primes it.
 */
function runLive(readings: AirGradientReading[], restartAt: number[] = []): AirQualityEvent[] {
  const table = new Map<string, AirQualityEvent>()
  const upsert = (events: AirQualityEvent[]) => {
    for (const e of events) table.set(e.id, { ...e, acknowledged: table.get(e.id)?.acknowledged ?? false })
  }
  let detector = new EventDetector()
  readings.forEach((r, i) => {
    if (restartAt.includes(i)) detector = restart(readings.slice(0, i), table)
    upsert(detector.push(r).map(c => c.event))
  })
  return [...table.values()].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
}

const PRIME_MS = 6 * HOUR

/** Mirrors buildLiveDetector() in lib/poller.ts. */
function restart(stored: AirGradientReading[], table: Map<string, AirQualityEvent>): EventDetector {
  const last = stored[stored.length - 1].timestamp.getTime()
  const open = [...table.values()].filter(e => e.endTime === null)
  const { detector, active } = primeDetector(stored.filter(r => r.timestamp.getTime() >= last - PRIME_MS), open)
  for (const e of active) table.set(e.id, e)
  const keep = new Set(active.map(e => e.id))
  for (const e of open) {
    if (!keep.has(e.id)) table.set(e.id, { ...e, endTime: new Date(e.startTime.getTime() + e.durationMinutes * MIN) })
  }
  return detector
}

function summary(events: AirQualityEvent[]) {
  return events.map(e => `${e.type} ${new Date(e.startTime).toISOString().slice(11, 16)}–${e.endTime ? new Date(e.endTime).toISOString().slice(11, 16) : 'open'}`)
}

// ─── One incident, one row ───────────────────────────────────────────────────

describe('one incident is one event', () => {
  it('does not split when the classification flips between VOC event and fuel vapour', () => {
    // PM drifting around baseline + 10 flips the rule that matches every few minutes.
    const readings = sequence([60, CLEAN], ...alternating(60, 6, FUEL, VOC), [30, CLEAN])
    const events = detectEvents(readings)
    expect(summary(events)).toHaveLength(1)
    expect(events[0].type).toBe('fuel_vapor')
    expect(events[0].endTime).not.toBeNull()
  })

  it('does not split when TVOC hovers around the fuel-vapour threshold', () => {
    const readings = sequence([60, CLEAN], ...alternating(60, 5, { tvocIndex: 270, pm02: 3 }, { tvocIndex: 230, pm02: 3 }), [30, CLEAN])
    expect(summary(detectEvents(readings))).toHaveLength(1)
  })

  it('labels a cooking incident by its most serious signature (combustion)', () => {
    const readings = sequence([60, CLEAN], [20, VOC], [20, COMBUSTION], [20, VOC], [30, CLEAN])
    const events = detectEvents(readings).filter(e => e.type !== 'ventilation_poor')
    expect(summary(events)).toHaveLength(1)
    expect(events[0].type).toBe('combustion_exhaust')
    expect(events[0].severity).toBe('critical')
    expect(events[0].peak.noxIndex).toBe(10)
  })

  it('keeps a critical VOC event critical when particulate takes over', () => {
    const readings = sequence([60, CLEAN], [20, { tvocIndex: 450, pm02: 20 }], [20, { tvocIndex: 150, pm02: 30 }], [30, CLEAN])
    const events = detectEvents(readings)
    expect(summary(events)).toHaveLength(1)
    expect(events[0].type).toBe('voc_event')
    expect(events[0].severity).toBe('critical')
  })

  it('reopens the same event when the source returns after a short clear spell', () => {
    const readings = sequence([60, CLEAN], [20, VOC], [8, CLEAN], [20, VOC], [30, CLEAN])
    expect(summary(detectEvents(readings))).toHaveLength(1)
  })

  it('reopens the same event when it returns with a different signature', () => {
    const readings = sequence([60, CLEAN], [20, VOC], [8, CLEAN], [20, FUEL], [30, CLEAN])
    const events = detectEvents(readings)
    expect(summary(events)).toHaveLength(1)
    expect(events[0].type).toBe('fuel_vapor')
  })

  it('still logs two events for two incidents an hour apart', () => {
    const readings = sequence([60, CLEAN], [20, VOC], [60, CLEAN], [20, VOC], [30, CLEAN])
    expect(summary(detectEvents(readings))).toHaveLength(2)
  })

  it('keeps one CO₂ event through a short dip below 1000 ppm', () => {
    const readings = sequence([60, CLEAN], [60, { rco2: 1200 }], [10, { rco2: 900 }], [60, { rco2: 1200 }], [60, CLEAN])
    const events = detectEvents(readings)
    expect(summary(events)).toHaveLength(1)
    expect(events[0].type).toBe('ventilation_poor')
  })

  it('logs two CO₂ events when the room was fine for most of an hour in between', () => {
    const readings = sequence([60, CLEAN], [60, { rco2: 1200 }], [50, { rco2: 800 }], [60, { rco2: 1200 }], [60, CLEAN])
    expect(summary(detectEvents(readings))).toHaveLength(2)
  })

  it('survives a short data gap mid-incident', () => {
    const before = sequence([60, CLEAN], [30, FUEL])
    const after = sequence([60 + 30 + 10, CLEAN], [30, FUEL], [30, CLEAN]).filter(r => r.timestamp.getTime() >= T0 + 100 * MIN)
    expect(summary(detectEvents([...before, ...after]))).toHaveLength(1)
  })

  it('matches live and batch detection', () => {
    const readings = sequence([60, CLEAN], ...alternating(60, 6, FUEL, VOC), [20, COMBUSTION], [30, CLEAN], [60, { rco2: 1300 }], [30, CLEAN])
    const live = runLive(readings)
    expect(live.map(e => [e.id, e.type, e.endTime?.getTime()])).toEqual(
      detectEvents(readings).map(e => [e.id, e.type, e.endTime?.getTime()]),
    )
  })
})

// ─── Restarts ────────────────────────────────────────────────────────────────

describe('server restart while an event is open', () => {
  it('continues the same row after a short restart', () => {
    const readings = sequence([60, CLEAN], [90, FUEL], [30, CLEAN])
    const restartAt = readings.findIndex(r => r.timestamp.getTime() >= T0 + 120 * MIN)
    const events = runLive(readings, [restartAt])
    expect(summary(events)).toHaveLength(1)
    expect(events[0].endTime).not.toBeNull()
  })

  it('continues a row whose type escalated before the restart', () => {
    // Fuel vapour first, then a long VOC tail that is all the replay sees.
    const readings = sequence([60, CLEAN], [20, FUEL], [8 * 60, VOC], [30, CLEAN])
    const restartAt = readings.findIndex(r => r.timestamp.getTime() >= T0 + 7 * HOUR)
    const events = runLive(readings, [restartAt])
    expect(summary(events)).toHaveLength(1)
    expect(events[0].type).toBe('fuel_vapor')
  })

  it('does not fold a stale open row into a new incident', () => {
    const readings = sequence([60, CLEAN], [40, FUEL], [60, CLEAN])
    const stale: AirQualityEvent = {
      ...detectEvents(sequence([60, CLEAN], [20, VOC], [30, CLEAN]))[0],
      id: 'voc_event_1', startTime: new Date(T0 - 3 * 24 * HOUR), endTime: null, durationMinutes: 20,
    }
    const { active } = primeDetector(readings.slice(0, readings.findIndex(r => r.timestamp.getTime() >= T0 + 90 * MIN)), [stale])
    expect(active.map(e => e.id)).toEqual([`fuel_vapor_${T0 + 60 * MIN}`])
  })

  it('a stale open row does not hide the real one', () => {
    const readings = sequence([60, CLEAN], [8 * 60, VOC], [60, { tvocIndex: 460, pm02: 20 }], [30, CLEAN])
    const restartAt = readings.findIndex(r => r.timestamp.getTime() >= T0 + 8 * HOUR)
    const live = runLive(readings.slice(0, restartAt))
    const real = live.find(e => e.endTime === null)!
    const stale: AirQualityEvent = { ...real, id: 'voc_event_1', startTime: new Date(T0 - 3 * 24 * HOUR), durationMinutes: 20 }
    const stored = readings.slice(0, restartAt).filter(r => r.timestamp.getTime() >= T0 + 2 * HOUR)
    expect(primeDetector(stored, [stale, real]).active.map(e => e.id)).toEqual([real.id])
  })

  it('takes the stored start time when the replay sees an earlier onset', () => {
    const readings = sequence([60, CLEAN], [60, FUEL])
    const replayed = detectEvents(readings).find(e => e.endTime === null)!
    const stored: AirQualityEvent = { ...replayed, id: 'fuel_vapor_x', startTime: new Date(replayed.startTime.getTime() + 20 * MIN), durationMinutes: 10 }
    const [active] = primeDetector(readings, [stored]).active
    expect(active.id).toBe('fuel_vapor_x')
    expect(active.startTime.getTime()).toBe(stored.startTime.getTime())
  })

  it('continues an incident that began before the replay window', () => {
    // Started 7 h before the restart: the 6 h replay only sees elevated air, so
    // its own rolling baseline would hide the event and later flag a new one.
    const readings = sequence([60, CLEAN], [8 * 60, VOC], [60, { tvocIndex: 460, pm02: 20 }], [30, CLEAN])
    const restartAt = readings.findIndex(r => r.timestamp.getTime() >= T0 + 8 * HOUR)
    const events = runLive(readings, [restartAt])
    expect(summary(events)).toHaveLength(1)
    expect(events[0].endTime!.getTime()).toBeGreaterThanOrEqual(T0 + 9 * HOUR + 50 * MIN)
  })
})
