import https from 'node:https'
import type { ClientRequest } from 'node:http'
import { getLights, getGroups } from './hue'
import { getSetting } from './db'
import type { HueLight, HueGroup } from './types'

// ── V2 SSE event shapes ──────────────────────────────────────────────────────

interface V2LightUpdate {
  id: string
  id_v1: string
  type: 'light'
  on?: { on: boolean }
  dimming?: { brightness: number }           // 0–100
  color_temperature?: { mirek: number | null }
  color?: { xy: { x: number; y: number } }
}

interface V2GroupedLightUpdate {
  id: string
  id_v1: string
  type: 'grouped_light'
  on?: { on: boolean }
  dimming?: { brightness: number }
}

type V2Resource = V2LightUpdate | V2GroupedLightUpdate | { type: string; id_v1?: string }

interface V2SseMessage {
  type: 'update' | 'add' | 'delete'
  data: V2Resource[]
}

// ── Singleton state ──────────────────────────────────────────────────────────

interface SseState {
  lights: HueLight[]
  groups: HueGroup[]
  subscribers: Set<(json: string) => void>
  req: ClientRequest | null
  readyPromise: Promise<void> | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  pendingGroupOnActions: Map<string, number>  // groupId → expiry timestamp
}

declare global {
  // eslint-disable-next-line no-var
  var __hueSse: SseState | undefined
}

function state(): SseState {
  if (!globalThis.__hueSse) {
    globalThis.__hueSse = {
      lights: [],
      groups: [],
      subscribers: new Set(),
      req: null,
      readyPromise: null,
      reconnectTimer: null,
      pendingGroupOnActions: new Map(),
    }
  }
  // Patch singletons created before pendingGroupOnActions was added
  if (!globalThis.__hueSse.pendingGroupOnActions) {
    globalThis.__hueSse.pendingGroupOnActions = new Map()
  }
  return globalThis.__hueSse!
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getLightsAndGroups(): { lights: HueLight[]; groups: HueGroup[] } {
  const s = state()
  return { lights: s.lights, groups: s.groups }
}

/**
 * Call this before PUT-ing an on/off action to a group so the SSE handler
 * knows to propagate the group's on state down to individual lights.
 * Without this, a grouped_light event triggered by an individual light change
 * would incorrectly override all lights in the group.
 */
export function notifyGroupOnAction(groupId: string): void {
  state().pendingGroupOnActions.set(groupId, Date.now() + 3000)
}

/** Subscribe to state broadcasts. Returns an unsubscribe function. */
export function subscribe(fn: (json: string) => void): () => void {
  const s = state()
  s.subscribers.add(fn)
  return () => s.subscribers.delete(fn)
}

/**
 * Initialise the singleton: fetch initial state via v1 REST then open the v2
 * SSE stream. Safe to call multiple times — only runs once per process.
 * Does NOT cache a failed promise, so callers can retry after bridge is
 * configured.
 */
export function initHueSse(): Promise<void> {
  const ip = getSetting('hue_bridge_ip')
  const key = getSetting('hue_api_key')
  if (!ip || !key) return Promise.resolve()

  const s = state()
  if (s.readyPromise) return s.readyPromise

  s.readyPromise = (async () => {
    try {
      const [lights, groups] = await Promise.all([getLights(), getGroups()])
      s.lights = lights
      s.groups = groups
    } catch {
      // Bridge unreachable on startup; SSE will reconnect and fill the cache
    }
    openSseConnection(s)
  })()

  return s.readyPromise
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
        // Split on blank lines to extract complete SSE events
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const block of parts) {
          const dataLine = block.split('\n').find(l => l.startsWith('data:'))
          if (!dataLine) continue
          try {
            const messages = JSON.parse(dataLine.slice(5).trim()) as V2SseMessage[]
            applyUpdates(s, messages)
          } catch { /* malformed event, skip */ }
        }
      })
      res.on('end', () => scheduleReconnect(s))
      res.on('error', () => scheduleReconnect(s))
    },
  )

  req.on('error', () => scheduleReconnect(s))
  req.setTimeout(0) // keep the connection open indefinitely

  s.req = req
}

function scheduleReconnect(s: SseState, delayMs = 5000) {
  if (s.reconnectTimer) clearTimeout(s.reconnectTimer)
  s.req = null
  s.reconnectTimer = setTimeout(async () => {
    s.reconnectTimer = null
    try {
      const [lights, groups] = await Promise.all([getLights(), getGroups()])
      s.lights = lights
      s.groups = groups
      broadcast(s)
    } catch { /* bridge still unreachable; SSE will sync state going forward */ }
    openSseConnection(s)
  }, delayMs)
}

// ── Event application ────────────────────────────────────────────────────────

function applyUpdates(s: SseState, messages: V2SseMessage[]) {
  let changed = false

  for (const msg of messages) {
    if (msg.type !== 'update') continue

    for (const item of msg.data) {
      if (item.type === 'light' && item.id_v1?.startsWith('/lights/')) {
        const ev = item as V2LightUpdate
        const id = lastSegment(ev.id_v1)
        s.lights = s.lights.map(l => {
          if (l.id !== id) return l
          const u = { ...l }
          if (ev.on !== undefined) u.on = ev.on.on
          if (ev.dimming !== undefined) u.brightness = scaleBri(ev.dimming.brightness)
          if (ev.color_temperature?.mirek != null) u.colorTemp = ev.color_temperature.mirek
          if (ev.color?.xy) {
            const hs = xyToHueSat(ev.color.xy.x, ev.color.xy.y, u.brightness)
            u.hue = hs.hue
            u.saturation = hs.saturation
          }
          return u
        })
        changed = true
      } else if (item.type === 'grouped_light' && item.id_v1?.startsWith('/groups/')) {
        const ev = item as V2GroupedLightUpdate
        const id = lastSegment(ev.id_v1)
        const existingGroup = s.groups.find(g => g.id === id)
        s.groups = s.groups.map(g => {
          if (g.id !== id) return g
          const u = { ...g }
          if (ev.on !== undefined) u.on = ev.on.on
          if (ev.dimming !== undefined) u.brightness = scaleBri(ev.dimming.brightness)
          return u
        })
        // Only propagate on/off to individual lights when we explicitly sent a
        // group action. Without this guard a grouped_light event fired by an
        // individual-light change (group still "on") overwrites all siblings.
        const groupOnPending = (s.pendingGroupOnActions.get(id) ?? 0) > Date.now()
        if (ev.on !== undefined && existingGroup && groupOnPending) {
          const onVal = ev.on.on
          s.lights = s.lights.map(l =>
            existingGroup.lightIds.includes(l.id) ? { ...l, on: onVal } : l
          )
        }
        changed = true
      }
    }
  }

  if (changed) broadcast(s)
}

function broadcast(s: SseState) {
  const json = JSON.stringify({ lights: s.lights, groups: s.groups })
  for (const fn of s.subscribers) {
    try { fn(json) } catch { /* subscriber gone */ }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** "/lights/4" → "4" */
function lastSegment(idV1: string): string {
  return idV1.split('/').pop() ?? ''
}

/** v2 brightness is 0–100; v1 is 0–254 */
function scaleBri(b: number): number {
  return Math.round(Math.max(0, Math.min(100, b)) * 254 / 100)
}

/**
 * CIE XY + v1 brightness → Hue-model hue (0–65535) and saturation (0–254).
 * Uses the Philips wide-gamut D65 matrix.
 */
function xyToHueSat(x: number, y: number, bri: number): { hue: number; saturation: number } {
  const z = 1 - x - y
  const Y = bri / 254
  const X = y > 1e-6 ? (Y / y) * x : 0
  const Z = y > 1e-6 ? (Y / y) * z : 0

  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152
  let b2 = X * 0.051713 - Y * 0.121364 + Z * 1.011530

  r = Math.max(0, r)
  g = Math.max(0, g)
  b2 = Math.max(0, b2)

  const max = Math.max(r, g, b2, 1e-6)
  r /= max; g /= max; b2 /= max

  const cmax = Math.max(r, g, b2)
  const cmin = Math.min(r, g, b2)
  const delta = cmax - cmin

  let h = 0
  if (delta > 1e-6) {
    if (cmax === r) h = ((g - b2) / delta) % 6
    else if (cmax === g) h = (b2 - r) / delta + 2
    else h = (r - g) / delta + 4
    h *= 60
  }
  if (h < 0) h += 360

  const sat = cmax < 1e-6 ? 0 : delta / cmax
  return {
    hue: Math.round((h / 360) * 65535),
    saturation: Math.round(sat * 254),
  }
}
