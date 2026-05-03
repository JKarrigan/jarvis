import { lookup } from 'dns/promises'
import { insertReading } from './db'

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

    const res = await fetch(`http://${state.resolvedIp}/measures/current`, {
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      state.lastError = 'Device returned error'
      return
    }

    insertReading(Date.now(), await res.json())
    state.lastError = null
  } catch {
    state.resolvedIp = null  // re-resolve on next attempt in case IP changed
    state.lastError = 'Device unreachable'
  }
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
