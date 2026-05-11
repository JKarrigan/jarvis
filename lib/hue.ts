import { getSetting } from './db'
import { addLog, truncateData } from './httpLog'
import type { HueLight, HueGroup } from './types'

// Internal Hue API v1 response shapes
interface HueRawLightState {
  on: boolean
  bri?: number
  ct?: number
  hue?: number
  sat?: number
  colormode?: string
  reachable: boolean
}
interface HueRawLight {
  name: string
  type: string
  state: HueRawLightState
}
interface HueRawGroupAction {
  on?: boolean
  bri?: number
  ct?: number
}
interface HueRawGroup {
  name: string
  type: string
  lights: string[]
  action: HueRawGroupAction
}
interface HueApiResult {
  success?: Record<string, unknown>
  error?: { description: string }
}

function getBase(): string {
  const ip = getSetting('hue_bridge_ip')
  const key = getSetting('hue_api_key')
  if (!ip || !key) throw new Error('Hue Bridge not configured')
  return `http://${ip}/api/${key}`
}

// Redact the API key from URLs before logging
function redact(url: string): string {
  const key = getSetting('hue_api_key')
  return key ? url.replace(key, '***') : url
}

async function loggedFetch(url: string, method: string, init?: RequestInit): Promise<Response> {
  const ts = Date.now()
  const requestBody = typeof init?.body === 'string' ? init.body : undefined
  try {
    const res = await fetch(url, init)
    const entry = addLog({
      ts, source: 'hue', method, url: redact(url),
      status: res.status, durationMs: Date.now() - ts,
      data: requestBody,
    })
    // For reads, capture the response body without consuming the stream the caller needs
    if (method === 'GET' && res.ok) {
      res.clone().json().then((body: unknown) => {
        entry.data = truncateData(body)
      }).catch(() => {})
    }
    return res
  } catch (err) {
    addLog({ ts, source: 'hue', method, url: redact(url), status: null, durationMs: Date.now() - ts, error: String(err), data: requestBody })
    throw err
  }
}

function parseLight(id: string, raw: HueRawLight): HueLight {
  return {
    id,
    name: raw.name,
    type: raw.type,
    on: raw.state.on,
    brightness: raw.state.bri ?? 0,
    reachable: raw.state.reachable,
    colorTemp: raw.state.ct,
    hue: raw.state.hue,
    saturation: raw.state.sat,
    colormode: raw.state.colormode,
  }
}

export async function getLights(): Promise<HueLight[]> {
  const res = await loggedFetch(`${getBase()}/lights`, 'GET', { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error('Failed to fetch lights')
  const data = await res.json() as Record<string, HueRawLight>
  return Object.entries(data).map(([id, raw]) => parseLight(id, raw))
}

export async function setLightState(
  id: string,
  state: { on?: boolean; brightness?: number; colorTemp?: number; hue?: number; saturation?: number }
): Promise<void> {
  const body: Record<string, unknown> = {}
  if (state.on !== undefined) body.on = state.on
  if (state.brightness !== undefined) body.bri = Math.round(Math.max(1, Math.min(254, state.brightness)))
  if (state.colorTemp !== undefined) body.ct = Math.round(Math.max(153, Math.min(500, state.colorTemp)))
  if (state.hue !== undefined) body.hue = Math.round(Math.max(0, Math.min(65535, state.hue)))
  if (state.saturation !== undefined) body.sat = Math.round(Math.max(0, Math.min(254, state.saturation)))

  const res = await loggedFetch(`${getBase()}/lights/${id}/state`, 'PUT', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error('Failed to set light state')
}

export async function getGroups(): Promise<HueGroup[]> {
  const res = await loggedFetch(`${getBase()}/groups`, 'GET', { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error('Failed to fetch groups')
  const data = await res.json() as Record<string, HueRawGroup>
  return Object.entries(data)
    .filter(([, g]) => g.type === 'Room' || g.type === 'Zone' || g.type === 'LightGroup')
    .map(([id, raw]) => ({
      id,
      name: raw.name,
      type: raw.type,
      lightIds: raw.lights,
      on: raw.action.on ?? false,
      brightness: raw.action.bri ?? 0,
    }))
}

export async function setGroupAction(
  id: string,
  action: { on?: boolean; brightness?: number; colorTemp?: number }
): Promise<void> {
  const body: Record<string, unknown> = {}
  if (action.on !== undefined) body.on = action.on
  if (action.brightness !== undefined) body.bri = Math.round(Math.max(1, Math.min(254, action.brightness)))
  if (action.colorTemp !== undefined) body.ct = Math.round(Math.max(153, Math.min(500, action.colorTemp)))

  const res = await loggedFetch(`${getBase()}/groups/${id}/action`, 'PUT', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error('Failed to set group action')
}

// Returns the API username on success.
// Throws 'press_button' if the link button hasn't been pressed.
export async function registerBridge(ip: string): Promise<string> {
  const res = await loggedFetch(`http://${ip}/api`, 'POST', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ devicetype: 'home-dashboard#pi' }),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error('Bridge did not respond')
  const data = await res.json() as HueApiResult[]
  const first = data[0]
  if (first.success) {
    const username = (first.success as { username: string }).username
    return username
  }
  const desc = first.error?.description ?? 'Unknown error'
  if (desc.toLowerCase().includes('link button')) throw new Error('press_button')
  throw new Error(desc)
}
