import 'server-only'
import { lookup } from 'dns/promises'
import {
  backfillEventTraces, getLatestReadingTimestamp, getOpenEvents, insertReading, iterateDetectorReadings,
  reconcileOpenEvents, rollupCompleteBefore, rollupReadings, storeEventTrace, upsertEvents,
} from './db'
import { primeDetector, type DetectorChange, type EventDetector } from './eventDetection'
import type { AirQualityEvent } from './eventTypes'
import { isLanHost } from './http'
import { addLog, truncateData } from './httpLog'

const POLL_MS = 10_000
const FETCH_TIMEOUT_MS = 5_000
const LOOKUP_TIMEOUT_MS = 3_000
/** Readings replayed into a fresh detector so an ongoing event is picked up after a restart. */
const PRIME_MS = 6 * 60 * 60 * 1000

interface PollerState {
  deviceIp: string | null
  resolvedIp: string | null  // cached to avoid repeated mDNS lookups
  timer: ReturnType<typeof setTimeout> | null
  /** Bumped on every (re)start; a scheduled tick from an older generation stops itself. */
  generation: number
  inFlight: boolean
  lastError: string | null
  lastReadingAt: number | null
  /** Live server-side event detector (null until first needed). */
  detector: EventDetector | null
}

// Persist across hot reloads in dev via globalThis — same pattern as db.ts
const g = globalThis as typeof globalThis & {
  __ag_poller?: PollerState
  __ag_traceTimer?: ReturnType<typeof setTimeout> | null
  __ag_rollup?: { timer: ReturnType<typeof setTimeout> | null; through: number | null }
}

function getState(): PollerState {
  if (!g.__ag_poller) {
    g.__ag_poller = {
      deviceIp: null, resolvedIp: null, timer: null, generation: 0, inFlight: false,
      lastError: null, lastReadingAt: null, detector: null,
    }
  }
  // Older dev sessions may have stored a state without the newer fields.
  const s = g.__ag_poller
  s.generation ??= 0
  s.inFlight ??= false
  s.lastReadingAt ??= null
  s.detector ??= null
  return s
}

/**
 * Accepts a private IPv4 address or an mDNS `.local` name (AirGradient's
 * default is `airgradient_<serial>.local`, with an underscore). A full URL is
 * reduced to its hostname. Anything else → null.
 */
export function normalizeDeviceHost(input: unknown): string | null {
  if (typeof input !== 'string') return null
  let host = input.trim()
  if (/^https?:\/\//i.test(host)) {
    try { host = new URL(host).hostname } catch { return null }
  }
  if (isLanHost(host)) return host
  return /^[a-z0-9]([a-z0-9_-]{0,61}[a-z0-9])?\.local$/i.test(host) ? host : null
}

// ─── Event detection ─────────────────────────────────────────────────────────

/**
 * Latest snapshot per id, so one write per event per batch of changes. An
 * event that just ended also gets its trace saved, while its readings exist.
 */
function persistChanges(changes: DetectorChange[]): void {
  if (changes.length === 0) return
  const byId = new Map<string, AirQualityEvent>()
  for (const c of changes) byId.set(c.event.id, c.event)
  upsertEvents([...byId.values()])
  for (const event of byId.values()) {
    if (event.endTime === null) continue
    try {
      storeEventTrace(event)
    } catch (err) {
      console.error('[poller] event trace failed', err)
    }
  }
}

const TRACE_BATCH = 5
const TRACE_BATCH_GAP_MS = 2_000

/**
 * Saves traces for finished events that have none (rows from before traces
 * existed, events closed while the server was down, or everything after a
 * reprocess), a few at a time so the event loop stays free.
 */
export function scheduleTraceBackfill(delayMs = TRACE_BATCH_GAP_MS): void {
  if (g.__ag_traceTimer) return
  const run = () => {
    g.__ag_traceTimer = null
    let handled = 0
    try {
      handled = backfillEventTraces(TRACE_BATCH)
    } catch (err) {
      console.error('[poller] event trace backfill failed', err)
    }
    if (handled === TRACE_BATCH) scheduleTraceBackfill()
  }
  const timer = setTimeout(run, delayMs)
  timer.unref?.()
  g.__ag_traceTimer = timer
}

// ─── Five-minute rollup ──────────────────────────────────────────────────────

const ROLLUP_BATCH_GAP_MS = 2_000

function rollupState() {
  return (g.__ag_rollup ??= { timer: null, through: null })
}

/**
 * Summarises raw readings into `readings_5m`, a day of readings per run and
 * runs a couple of seconds apart until nothing complete is left (the first
 * run on an existing database works through weeks of readings).
 */
export function scheduleRollup(delayMs = ROLLUP_BATCH_GAP_MS): void {
  const state = rollupState()
  if (state.timer) return
  const run = () => {
    state.timer = null
    let more = false
    try {
      const result = rollupReadings()
      state.through = result.through
      more = result.more
    } catch (err) {
      console.error('[poller] readings rollup failed', err)
    }
    if (more) scheduleRollup()
  }
  const timer = setTimeout(run, delayMs)
  timer.unref?.()
  state.timer = timer
}

/**
 * Called after every stored reading: once a five-minute bucket has been over
 * for 60 s (so at most ~6 minutes after it started a new one), roll it up.
 * Cheap: compares two numbers until then.
 */
function rollupIfDue(now: number): void {
  const { through } = rollupState()
  if (through == null || rollupCompleteBefore(now) > through) scheduleRollup(0)
}

/**
 * Builds the live detector: replays the last few hours of stored readings
 * (silently — those events were already written), continues any event the
 * database still has open, and closes open rows nothing is tracking.
 */
function buildLiveDetector(): EventDetector {
  const last = getLatestReadingTimestamp()
  const recent = last != null ? iterateDetectorReadings(last - PRIME_MS, last) : []
  const { detector, active } = primeDetector(recent, getOpenEvents())
  reconcileOpenEvents(active)
  return detector
}

function getDetector(): EventDetector {
  const state = getState()
  if (!state.detector) state.detector = buildLiveDetector()
  return state.detector
}

/** Primes the live detector at boot so stale open events are reconciled even before the first poll. */
export function initEventDetection(): void {
  getDetector()
}

/**
 * Swaps in a detector built elsewhere (the reprocess endpoint replays all
 * history and hands over its final state so live ids match the new rows).
 * Call after the events table has been rewritten and merged: an open event
 * whose row was merged into an older one continues under the surviving id.
 */
export function replaceLiveDetector(detector: EventDetector): void {
  reconcileOpenEvents(detector.resume(getOpenEvents()))
  getState().detector = detector
}

// ─── Polling ─────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function fail(state: PollerState, message: string): void {
  state.resolvedIp = null
  state.lastError = message
  // Device offline for a long time → close events instead of leaving them open.
  if (state.detector) persistChanges(state.detector.expire(Date.now()))
}

async function poll(): Promise<void> {
  const state = getState()
  const host = state.deviceIp
  if (!host) return

  let url = `http://${host}/measures/current`
  const ts = Date.now()
  try {
    if (!state.resolvedIp) {
      state.resolvedIp = host.endsWith('.local')
        ? (await withTimeout(lookup(host), LOOKUP_TIMEOUT_MS, 'mDNS lookup timed out')).address
        : host
    }
    url = `http://${state.resolvedIp}/measures/current`

    let res: Response
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    } catch (err) {
      addLog({ ts, source: 'air-gradient', method: 'GET', url, status: null, durationMs: Date.now() - ts, error: String(err) })
      fail(state, 'Device unreachable')
      return
    }

    const entry = addLog({ ts, source: 'air-gradient', method: 'GET', url, status: res.status, durationMs: Date.now() - ts })
    if (!res.ok) {
      fail(state, 'Device returned error')
      return
    }

    let measures: unknown
    try {
      measures = await res.json()
    } catch {
      fail(state, 'Device returned invalid JSON')
      return
    }
    entry.data = truncateData(measures)
    if (host !== state.deviceIp) return // host changed while this request was in flight

    const now = Date.now()
    // Clock went backwards (e.g. Pi booted before NTP sync): don't write
    // readings out of order; wait until the clock catches up.
    if (state.lastReadingAt != null && now <= state.lastReadingAt) {
      state.lastError = 'Server clock is behind the last stored reading'
      return
    }
    if (!insertReading(now, measures)) {
      fail(state, 'Device returned incomplete data')
      return
    }
    state.lastReadingAt = now
    state.lastError = null

    try {
      const m = measures as Record<string, number>
      persistChanges(getDetector().push({
        timestamp: new Date(now),
        pm02: m.pm02,
        rco2: m.rco2,
        tvocIndex: m.tvocIndex,
        noxIndex: m.noxIndex,
        atmp: m.atmpCompensated ?? m.atmp,
        rhum: m.rhumCompensated ?? m.rhum,
      }))
    } catch (err) {
      console.error('[poller] event detection failed', err)
    }

    try {
      rollupIfDue(now)
    } catch (err) {
      console.error('[poller] readings rollup failed', err)
    }
  } catch (err) {
    addLog({ ts, source: 'air-gradient', method: 'GET', url, status: null, durationMs: Date.now() - ts, error: String(err) })
    fail(state, 'Device unreachable')
  }
}

function schedule(generation: number, delay: number): void {
  const state = getState()
  const timer = setTimeout(() => { void tick(generation) }, delay)
  timer.unref?.()
  state.timer = timer
}

/** setTimeout chain: the next poll is scheduled only after this one finishes, so polls never stack. */
async function tick(generation: number): Promise<void> {
  const state = getState()
  if (generation !== state.generation) return
  const started = Date.now()
  if (!state.inFlight) {
    state.inFlight = true
    try {
      await poll()
    } finally {
      state.inFlight = false
    }
  }
  if (generation !== state.generation) return
  schedule(generation, Math.max(1_000, POLL_MS - (Date.now() - started)))
}

function restartChain(state: PollerState): void {
  if (state.timer !== null) clearTimeout(state.timer)
  state.timer = null
  state.generation++
  state.inFlight = false
  void tick(state.generation)
}

// On hot reload the module re-evaluates but the scheduled timer still points
// at the OLD tick closure. Restart the chain so new code takes effect.
if (g.__ag_poller?.timer != null && g.__ag_poller.deviceIp) {
  restartChain(getState())
}

/** Starts (or retargets) the server-side poller. The host must already be validated. */
export function startPoller(host: string): void {
  const state = getState()
  if (state.deviceIp === host && state.timer !== null) return

  state.deviceIp = host
  state.resolvedIp = null
  state.lastError = null
  if (state.lastReadingAt == null) state.lastReadingAt = getLatestReadingTimestamp()
  restartChain(state)
}

export function getPollerStatus(): { ip: string | null; error: string | null; lastReadingAt: number | null } {
  const { deviceIp, lastError, lastReadingAt } = getState()
  return { ip: deviceIp, error: lastError, lastReadingAt }
}
