import 'server-only'
import { getSetting, pruneEvents, pruneReadings } from './db'
import { initEventDetection, normalizeDeviceHost, startPoller } from './poller'
import { startPhotoScheduler } from './photos/scan'

/**
 * Server-side background work, started once per server process from
 * `register()` in /instrumentation.ts (Node.js runtime only), so data is
 * collected after a reboot without any browser open.
 *
 * To add another job, import it here and call it from startBackgroundJobs()
 * inside its own try/catch so one failing job cannot stop the others.
 */

const READINGS_KEEP_MS = 30 * 24 * 60 * 60 * 1000
const EVENTS_KEEP_MS = 90 * 24 * 60 * 60 * 1000
const PRUNE_EVERY_MS = 60 * 60 * 1000

/** Settings key holding the AirGradient host saved by POST /api/device. */
export const DEVICE_HOST_SETTING = 'ag.deviceHost'

const g = globalThis as typeof globalThis & { __ag_jobs?: { started: boolean; pruneTimer: ReturnType<typeof setInterval> | null } }

function prune(): void {
  try {
    const readings = pruneReadings(READINGS_KEEP_MS)
    const events = pruneEvents(EVENTS_KEEP_MS)
    if (readings || events) console.log(`[startup] pruned ${readings} readings, ${events} events`)
  } catch (err) {
    console.error('[startup] prune failed', err)
  }
}

function startAirGradient(): void {
  try {
    initEventDetection()
  } catch (err) {
    console.error('[startup] event detection init failed', err)
  }
  const host = normalizeDeviceHost(getSetting(DEVICE_HOST_SETTING) ?? process.env.DEVICE_HOST ?? process.env.NEXT_PUBLIC_DEVICE_HOST)
  if (host) {
    startPoller(host)
    console.log(`[startup] AirGradient poller started for ${host}`)
  } else {
    console.log('[startup] no AirGradient host configured yet (POST /api/device or set DEVICE_HOST)')
  }
}

export function startBackgroundJobs(): void {
  g.__ag_jobs ??= { started: false, pruneTimer: null }
  const jobs = g.__ag_jobs
  if (jobs.started) return
  jobs.started = true

  try {
    startAirGradient()
  } catch (err) {
    console.error('[startup] AirGradient poller failed to start', err)
  }

  prune()
  jobs.pruneTimer = setInterval(prune, PRUNE_EVERY_MS)
  jobs.pruneTimer.unref?.()

  // Photos: index the NAS share on start and every 6 h (lib/photos/scan.ts).
  try {
    startPhotoScheduler()
  } catch (err) {
    console.error('[startup] photo scanner failed to start', err)
  }
}
