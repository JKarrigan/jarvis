import https from 'node:https'
import type { ClientRequest } from 'node:http'
import { getLights, getGroups } from './hue'
import { getSetting } from './db'

// ── Singleton state ──────────────────────────────────────────────────────────

interface SseState {
  subscribers: Set<(json: string) => void>
  req: ClientRequest | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  refreshDebounce: ReturnType<typeof setTimeout> | null
}

declare global {
  // eslint-disable-next-line no-var
  var __hueSse: SseState | undefined
}

function state(): SseState {
  if (!globalThis.__hueSse) {
    globalThis.__hueSse = {
      subscribers: new Set(),
      req: null,
      reconnectTimer: null,
      refreshDebounce: null,
    }
  }
  return globalThis.__hueSse
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Subscribe to state broadcasts. Returns an unsubscribe function. */
export function subscribe(fn: (json: string) => void): () => void {
  const s = state()
  s.subscribers.add(fn)
  return () => s.subscribers.delete(fn)
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
  const ip = getSetting('hue_bridge_ip')
  const key = getSetting('hue_api_key')
  if (!ip || !key) return

  const s = state()
  if (s.req !== null || s.reconnectTimer !== null) return

  openSseConnection(s)
}

// ── Bridge SSE connection ────────────────────────────────────────────────────

function openSseConnection(s: SseState) {
  const ip = getSetting('hue_bridge_ip')
  const key = getSetting('hue_api_key')
  if (!ip || !key) return

  let buffer = ''

  const req = https.get(
    `https://${ip}/eventstream/clip/v2`,
    {
      headers: { 'hue-application-key': key, Accept: 'text/event-stream' },
      rejectUnauthorized: false,
    },
    (res) => {
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const block of parts) {
          const dataLine = block.split('\n').find(l => l.startsWith('data:'))
          if (!dataLine) continue
          try {
            const messages = JSON.parse(dataLine.slice(5).trim()) as Array<{ type: string }>
            if (messages.some(m => m.type === 'update')) {
              scheduleRefresh(s)
            }
          } catch { /* malformed event, skip */ }
        }
      })
      res.on('end', () => scheduleReconnect(s))
      res.on('error', () => scheduleReconnect(s))
    },
  )

  req.on('error', () => scheduleReconnect(s))
  req.setTimeout(0)
  s.req = req
}

function scheduleReconnect(s: SseState, delayMs = 5000) {
  if (s.reconnectTimer) clearTimeout(s.reconnectTimer)
  s.req = null
  s.reconnectTimer = setTimeout(() => {
    s.reconnectTimer = null
    openSseConnection(s)
  }, delayMs)
}

// ── Refresh on bridge event ──────────────────────────────────────────────────

// Debounce so a burst of events from a group action collapses into one fetch.
function scheduleRefresh(s: SseState, delayMs = 100) {
  if (s.refreshDebounce) clearTimeout(s.refreshDebounce)
  s.refreshDebounce = setTimeout(async () => {
    s.refreshDebounce = null
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
