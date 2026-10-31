import 'server-only'
import { lookup } from 'dns/promises'
import {
  closeOrphanEvents, getLatestReadingTimestamp, getOpenEvents, insertReading,
  iterateDetectorReadings, upsertEvents,
} from './db'
import { EventDetector, type DetectorChange } from './eventDetection'
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
const g = globalThis as typeof globalThis & { __ag_poller?: PollerState }

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

/** Latest snapshot per id, so one write per event per batch of changes. */
function persistChanges(changes: DetectorChange[]): void {
  if (changes.length === 0) return
  const byId = new Map<string, AirQualityEvent>()
  for (const c of changes) byId.set(c.event.id, c.event)
  upsertEvents([...byId.values()])
}

/**
 * Builds the live detector: replays the last few hours of stored readings
 * (silently — those events were already written), continues any event the
 * database still has open, and closes open rows nothing is tracking.
 */
function primeDetector(): EventDetector {
  const detector = new EventDetector()
  const last = getLatestReadingTimestamp()
  if (last != null) {
    for (const r of iterateDetectorReadings(last - PRIME_MS, last)) detector.push(r)
  }
  const active = detector.adopt(getOpenEvents())
  upsertEvents(active)
  closeOrphanEvents(active.map(e => e.id))
  return detector
}

function getDetector(): EventDetector {
  const state = getState()
  if (!state.detector) state.detector = primeDetector()
  return state.detector
}

/** Primes the live detector at boot so stale open events are reconciled even before the first poll. */
export function initEventDetection(): void {
  getDetector()
}

/**
 * Swaps in a detector built elsewhere (the reprocess endpoint replays all
 * history and hands over its final state so live ids match the new rows).
 */
export function replaceLiveDetector(detector: EventDetector): void {
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
