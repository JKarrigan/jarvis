import { lookup } from 'dns/promises'
import { insertReading } from './db'
import { addLog, truncateData } from './httpLog'

const POLL_MS = 10_000

interface PollerState {
  deviceIp: string | null
  resolvedIp: string | null  // cached to avoid repeated mDNS lookups
  timer: ReturnType<typeof setInterval> | null
  lastError: string | null
}

// Persist across hot reloads in dev via globalThis — same pattern as db.ts
const g = globalThis as typeof globalThis & { __ag_poller?: PollerState }

function getState(): PollerState {
  if (!g.__ag_poller) {
    g.__ag_poller = { deviceIp: null, resolvedIp: null, timer: null, lastError: null }
  }
  return g.__ag_poller
}

async function poll(): Promise<void> {
  const state = getState()
  if (!state.deviceIp) return

  try {
    if (!state.resolvedIp) {
      state.resolvedIp = state.deviceIp.endsWith('.local')
        ? (await lookup(state.deviceIp)).address
        : state.deviceIp
    }

    const url = `http://${state.resolvedIp}/measures/current`
    const ts = Date.now()
    let res: Response
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    } catch (err) {
      addLog({ ts, source: 'air-gradient', method: 'GET', url, status: null, durationMs: Date.now() - ts, error: String(err) })
      state.resolvedIp = null
      state.lastError = 'Device unreachable'
      return
    }

    const entry = addLog({ ts, source: 'air-gradient', method: 'GET', url, status: res.status, durationMs: Date.now() - ts })

    if (!res.ok) {
      state.lastError = 'Device returned error'
      return
    }

    const measures = await res.json()
    entry.data = truncateData(measures)
    insertReading(Date.now(), measures)
    state.lastError = null
  } catch {
    state.resolvedIp = null
    state.lastError = 'Device unreachable'
  }
}

// On hot reload the module re-evaluates but the globalThis timer keeps running
// with the OLD poll closure. Replace it with the current one so new code
// (e.g. logging) takes effect without restarting the server.
if (g.__ag_poller?.timer !== null && g.__ag_poller?.timer !== undefined) {
  clearInterval(g.__ag_poller.timer)
  g.__ag_poller.timer = setInterval(poll, POLL_MS)
}

export function startPoller(ip: string): void {
  const state = getState()
  if (state.deviceIp === ip && state.timer !== null) return

  if (state.timer !== null) {
    clearInterval(state.timer)
    state.timer = null
    state.resolvedIp = null
  }

  state.deviceIp = ip
  poll()
  state.timer = setInterval(poll, POLL_MS)
}

export function getPollerStatus(): { ip: string | null; error: string | null } {
  const { deviceIp, lastError } = getState()
  return { ip: deviceIp, error: lastError }
}
