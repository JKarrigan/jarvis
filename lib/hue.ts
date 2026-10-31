import { getSetting } from './db'
import { isLanHost } from './http'
import { addLog, truncateData } from './httpLog'
import type { HueLight, HueGroup } from './types'

// Internal Hue API v1 response shapes
interface HueRawLightState {
  on: boolean
  bri?: number
  ct?: number
  hue?: number
  sat?: number
  xy?: [number, number]
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
interface HueRawGroupState {
  any_on?: boolean
  all_on?: boolean
}
interface HueRawGroup {
  name: string
  type: string
  lights: string[]
  action: HueRawGroupAction
  state?: HueRawGroupState
}
interface HueApiResult {
  success?: Record<string, unknown>
  error?: { type?: number; address?: string; description?: string }
}

/** Light as returned to the client. `xy` is only meaningful when colormode === 'xy'. */

/**
 * The bridge rejected a command. v1 answers 200 with `[{ error: … }]` bodies,
 * so this is raised after parsing the body; its message is the bridge's own
 * description (safe to show — it never contains local paths or keys).
 */
export class HueBridgeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HueBridgeError'
  }
}

/** Hue light / group ids are small decimal integers ("0" is the all-lights group). */
export function isHueId(id: unknown): id is string {
  return typeof id === 'string' && /^\d{1,5}$/.test(id)
}

/** Bridge usernames are 40-char alphanumeric strings; never accept anything that could alter the URL. */
function isHueKey(key: string): boolean {
  return /^[A-Za-z0-9-]{1,64}$/.test(key)
}

/** The configured bridge, or null when it is missing or the stored values are not safe to use. */
export function getBridgeConfig(): { ip: string; key: string } | null {
  const ip = getSetting('hue_bridge_ip')
  const key = getSetting('hue_api_key')
  if (!ip || !key || !isLanHost(ip) || !isHueKey(key)) return null
  return { ip, key }
}

function getBase(): string {
  const cfg = getBridgeConfig()
  if (!cfg) throw new Error('Hue Bridge not configured')
  return `http://${cfg.ip}/api/${cfg.key}`
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
    // Capture the response body without consuming the stream the caller needs.
    // Mutations log the bridge's reply, since that is where v1 reports errors.
    if (res.ok) {
      res.clone().json().then((body: unknown) => {
        entry.data = method === 'GET' ? truncateData(body) : truncateData({ request: requestBody, response: body })
      }).catch(() => {})
    }
    return res
  } catch (err) {
    addLog({ ts, source: 'hue', method, url: redact(url), status: null, durationMs: Date.now() - ts, error: String(err), data: requestBody })
    throw err
  }
}

/**
 * Reads a v1 mutation response and throws HueBridgeError when any entry is an
 * error (the HTTP status is 200 either way).
 */
async function checkResults(res: Response, what: string): Promise<void> {
  if (!res.ok) throw new Error(`${what}: bridge returned HTTP ${res.status}`)
  let results: unknown
  try { results = await res.json() } catch { throw new Error(`${what}: unreadable bridge response`) }
  if (!Array.isArray(results)) return
  const errors = (results as HueApiResult[])
    .map(r => r?.error)
    .filter((e): e is NonNullable<HueApiResult['error']> => !!e)
  if (errors.length > 0) {
    throw new HueBridgeError(errors.map(e => e.description ?? 'Unknown bridge error').join('; '))
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
    xy: raw.state.xy,
    colormode: raw.state.colormode,
  }
}

export async function getLights(): Promise<HueLight[]> {
  const res = await loggedFetch(`${getBase()}/lights`, 'GET', { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error('Failed to fetch lights')
  const data = await res.json() as Record<string, HueRawLight> | HueApiResult[]
  // An invalid key yields 200 [{ error: { type: 1, description: 'unauthorized user' } }]
  if (Array.isArray(data)) throw new HueBridgeError(data[0]?.error?.description ?? 'Unexpected bridge response')
  return Object.entries(data).map(([id, raw]) => parseLight(id, raw))
}

export async function setLightState(
  id: string,
  state: { on?: boolean; brightness?: number; colorTemp?: number; hue?: number; saturation?: number }
): Promise<void> {
  if (!isHueId(id)) throw new Error('Invalid light id')
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
  await checkResults(res, 'Failed to set light state')
}

export async function getGroups(): Promise<HueGroup[]> {
  const res = await loggedFetch(`${getBase()}/groups`, 'GET', { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error('Failed to fetch groups')
  const data = await res.json() as Record<string, HueRawGroup> | HueApiResult[]
  if (Array.isArray(data)) throw new HueBridgeError(data[0]?.error?.description ?? 'Unexpected bridge response')
  return Object.entries(data)
    .filter(([, g]) => g.type === 'Room' || g.type === 'Zone' || g.type === 'LightGroup')
    .map(([id, raw]) => ({
      id,
      name: raw.name,
      type: raw.type,
      lightIds: raw.lights,
      // `action` is the last command sent to the group, not what the lights are
      // doing now; `state.any_on` reflects lights switched individually too.
      on: raw.state?.any_on ?? raw.action.on ?? false,
      brightness: raw.action.bri ?? 0,
    }))
}

export async function setGroupAction(
  id: string,
  action: { on?: boolean; brightness?: number; colorTemp?: number }
): Promise<void> {
  if (!isHueId(id)) throw new Error('Invalid group id')
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
  await checkResults(res, 'Failed to set group action')
}

// Returns the API username on success.
// Throws 'press_button' if the link button hasn't been pressed.
export async function registerBridge(ip: string, signal?: AbortSignal): Promise<string> {
  if (!isLanHost(ip)) throw new Error('Invalid bridge address')
  const timeout = AbortSignal.timeout(5000)
  const res = await loggedFetch(`http://${ip}/api`, 'POST', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ devicetype: 'home-dashboard#pi' }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!res.ok) throw new Error('Bridge did not respond')
  const data = await res.json() as unknown
  const first = Array.isArray(data) ? (data[0] as HueApiResult | undefined) : undefined
  if (!first) throw new Error('Unexpected bridge response')
  const username = (first.success as { username?: unknown } | undefined)?.username
  if (typeof username === 'string' && isHueKey(username)) return username
  const desc = first.error?.description ?? 'Unknown error'
  if (desc.toLowerCase().includes('link button')) throw new Error('press_button')
  throw new HueBridgeError(desc)
}
