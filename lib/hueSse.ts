import https from 'node:https'
import type { ClientRequest } from 'node:http'
import { getLights, getGroups, getBridgeConfig } from './hue'

/**
 * One upstream connection to the bridge's CLIP v2 event stream, shared by every
 * browser subscribed to /api/lights/stream. Each relevant bridge event triggers
 * a (debounced) v1 snapshot that is broadcast to all subscribers.
 *
 * Robustness:
 * - TCP keepalive + an idle watchdog: a bridge reboot leaves a half-open socket
 *   that never errors, so no bytes for IDLE_MS → destroy and reconnect.
 * - Non-200 answers (401/403 after the key was revoked, 503 while booting) back
 *   off exponentially instead of hammering the bridge every few seconds.
 * - The parse buffer is capped; a stream without event separators can't grow it forever.
 * - No subscribers → no refreshes, and the upstream closes after STOP_AFTER_MS.
 */

const IDLE_MS = Number(process.env.HUE_SSE_IDLE_MS) > 0 ? Number(process.env.HUE_SSE_IDLE_MS) : 60_000
const STOP_AFTER_MS = 60_000
const KEEPALIVE_MS = 15_000
const MAX_BUFFER = 1_000_000
const BASE_BACKOFF_MS = 5_000
const MAX_BACKOFF_MS = 5 * 60_000

// ── Singleton state ──────────────────────────────────────────────────────────

const STATE_VERSION = 2

interface SseState {
  version: number
  subscribers: Set<(json: string) => void>
  req: ClientRequest | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  refreshDebounce: ReturnType<typeof setTimeout> | null
  idleTimer: ReturnType<typeof setTimeout> | null
  stopTimer: ReturnType<typeof setTimeout> | null
  failures: number
  /** True once a connection has succeeded; later successes are reconnects that may have missed events. */
  connectedBefore: boolean
}

declare global {
  var __hueSse: SseState | undefined
}

function state(): SseState {
  const existing = globalThis.__hueSse
  if (existing && existing.version === STATE_VERSION) return existing
  // First load, or a hot reload replaced an older state shape: drop the old connection.
  const old = existing as Partial<SseState> | undefined
  old?.req?.destroy()
  if (old?.reconnectTimer) clearTimeout(old.reconnectTimer)
  if (old?.refreshDebounce) clearTimeout(old.refreshDebounce)
  const s: SseState = {
    version: STATE_VERSION,
    subscribers: old?.subscribers ?? new Set(),
    req: null,
    reconnectTimer: null,
    refreshDebounce: null,
    idleTimer: null,
    stopTimer: null,
    failures: 0,
    connectedBefore: false,
  }
  globalThis.__hueSse = s
  return s
}

function log(msg: string) {
  console.info(`[hue-sse] ${msg}`)
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Subscribe to state broadcasts (opens the upstream if needed). Returns an unsubscribe function. */
export function subscribe(fn: (json: string) => void): () => void {
  const s = state()
  s.subscribers.add(fn)
  if (s.stopTimer) { clearTimeout(s.stopTimer); s.stopTimer = null }
  initHueSse()
  let done = false
  return () => {
    if (done) return
    done = true
    s.subscribers.delete(fn)
    if (s.subscribers.size === 0 && !s.stopTimer) {
      s.stopTimer = setTimeout(() => {
        s.stopTimer = null
        if (s.subscribers.size === 0) {
          log('no subscribers, closing bridge stream')
          stop(s)
        }
      }, STOP_AFTER_MS)
    }
  }
}

/** Fetch current lights + groups fresh from the bridge. */
export async function fetchSnapshot(): Promise<string> {
  const [lights, groups] = await Promise.all([getLights(), getGroups()])
  return JSON.stringify({ lights, groups })
}

/**
 * Ensure the upstream SSE connection to the bridge is open.
 * Safe to call multiple times — no-ops if already running or reconnecting.
 */
export function initHueSse(): void {
  if (!getBridgeConfig()) return
  const s = state()
  if (s.req !== null || s.reconnectTimer !== null) return
  openSseConnection(s)
}

/**
 * Drop the current upstream (e.g. after re-registering with a different bridge
 * or key) and reconnect with the new settings if anyone is listening.
 */
export function resetHueSse(): void {
  const s = state()
  stop(s)
  s.failures = 0
  s.connectedBefore = false
  if (s.subscribers.size > 0) initHueSse()
}

// ── Bridge SSE connection ────────────────────────────────────────────────────

function stop(s: SseState) {
  const req = s.req
  s.req = null // mark first so the destroyed request's handlers see they are stale
  req?.destroy()
  for (const key of ['reconnectTimer', 'refreshDebounce', 'idleTimer'] as const) {
    const t = s[key]
    if (t) clearTimeout(t)
    s[key] = null
  }
}

function armWatchdog(s: SseState, req: ClientRequest) {
  if (s.idleTimer) clearTimeout(s.idleTimer)
  s.idleTimer = setTimeout(() => {
    s.idleTimer = null
    if (s.req !== req) return
    log(`no data from bridge for ${Math.round(IDLE_MS / 1000)} s, reconnecting`)
    s.req = null
    req.destroy()
    scheduleReconnect(s, 1000)
  }, IDLE_MS)
}

function openSseConnection(s: SseState) {
  const cfg = getBridgeConfig()
  if (!cfg) return

  let buffer = ''

  const req = https.get(
    `https://${cfg.ip}/eventstream/clip/v2`,
    {
      headers: { 'hue-application-key': cfg.key, Accept: 'text/event-stream' },
      // The bridge serves a certificate signed by the Signify CA for its own id,
      // not for the IP; cfg.ip is validated to be a private LAN address.
      rejectUnauthorized: false,
    },
    (res) => {
      if (s.req !== req) { res.resume(); return }

      if (res.statusCode !== 200) {
        res.resume()
        s.failures++
        const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (s.failures - 1))
        log(`bridge answered HTTP ${res.statusCode}, retrying in ${Math.round(delay / 1000)} s`)
        s.req = null
        req.destroy()
        scheduleReconnect(s, delay)
        return
      }

      log(s.connectedBefore ? 'reconnected to bridge event stream' : 'connected to bridge event stream')
      // After a gap we may have missed events: push a fresh snapshot.
      if (s.connectedBefore) scheduleRefresh(s)
      s.connectedBefore = true
      s.failures = 0
      armWatchdog(s, req)
      res.setEncoding('utf8')

      res.on('data', (chunk: string) => {
        if (s.req !== req) return
        armWatchdog(s, req)
        buffer += chunk
        if (buffer.length > MAX_BUFFER) {
          log('event buffer overflow, reconnecting')
          s.req = null
          req.destroy()
          scheduleReconnect(s)
          return
        }
        const parts = buffer.split(/\r?\n\r?\n/)
        buffer = parts.pop() ?? ''
        for (const block of parts) {
          const data = block
            .split(/\r?\n/)
            .filter(l => l.startsWith('data:'))
            .map(l => l.slice(5).trimStart())
            .join('\n')
          if (!data) continue // comment / keepalive
          try {
            const messages = JSON.parse(data) as Array<{ type?: string; data?: Array<{ type?: string }> }>
            const relevant = Array.isArray(messages) && messages.some(m =>
              m.type === 'update' && (m.data ?? []).some(d => d.type === 'light' || d.type === 'grouped_light'))
            if (relevant) scheduleRefresh(s)
          } catch { /* malformed event, skip */ }
        }
      })
      res.on('end', () => { if (s.req === req) scheduleReconnect(s) })
      res.on('error', () => { if (s.req === req) scheduleReconnect(s) })
    },
  )

  req.on('socket', socket => socket.setKeepAlive(true, KEEPALIVE_MS))
  req.on('error', (err) => {
    if (s.req !== req) return
    s.failures++
    const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (s.failures - 1))
    log(`connection error (${err.message}), retrying in ${Math.round(delay / 1000)} s`)
    scheduleReconnect(s, delay)
  })
  s.req = req
  // Also covers a connect/handshake that hangs without ever answering.
  armWatchdog(s, req)
}

function scheduleReconnect(s: SseState, delayMs = BASE_BACKOFF_MS) {
  if (s.reconnectTimer) clearTimeout(s.reconnectTimer)
  if (s.idleTimer) { clearTimeout(s.idleTimer); s.idleTimer = null }
  const old = s.req
  s.req = null
  old?.destroy()
  s.reconnectTimer = setTimeout(() => {
    s.reconnectTimer = null
    if (s.subscribers.size === 0) return // nobody listening; the next subscribe reopens
    openSseConnection(s)
  }, delayMs)
}

// ── Refresh on bridge event ──────────────────────────────────────────────────

// Debounce so a burst of events from a group action collapses into one fetch.
function scheduleRefresh(s: SseState, delayMs = 100) {
  if (s.subscribers.size === 0) return
  if (s.refreshDebounce) clearTimeout(s.refreshDebounce)
  s.refreshDebounce = setTimeout(async () => {
    s.refreshDebounce = null
    if (s.subscribers.size === 0) return
    try {
      const json = await fetchSnapshot()
      broadcast(s, json)
    } catch { /* bridge temporarily unreachable; next event will retry */ }
  }, delayMs)
}

function broadcast(s: SseState, json: string) {
  for (const fn of s.subscribers) {
    try { fn(json) } catch { /* subscriber gone */ }
  }
}
