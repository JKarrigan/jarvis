export interface HttpLogEntry {
  id: number
  ts: number
  source: 'air-gradient' | 'hue' | 'outdoor-aqi'
  method: string
  url: string
  status: number | null
  durationMs: number
  error?: string
  data?: string  // request body (mutations) or response body (reads), truncated JSON
}

interface LogState {
  entries: HttpLogEntry[]
  nextId: number
}

const MAX_ENTRIES = 500
const MAX_DATA_LEN = 1000

declare global {
  // eslint-disable-next-line no-var
  var __ag_httplog: LogState | undefined
}

function state(): LogState {
  if (!globalThis.__ag_httplog) {
    globalThis.__ag_httplog = { entries: [], nextId: 1 }
  }
  return globalThis.__ag_httplog
}

export function addLog(entry: Omit<HttpLogEntry, 'id'>): HttpLogEntry {
  const s = state()
  const full: HttpLogEntry = { ...entry, id: s.nextId++ }
  s.entries.push(full)
  if (s.entries.length > MAX_ENTRIES) {
    s.entries.splice(0, s.entries.length - MAX_ENTRIES)
  }
  return full
}

export function truncateData(raw: unknown): string {
  const str = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
  return str.length > MAX_DATA_LEN ? str.slice(0, MAX_DATA_LEN) + '\n…' : str
}

export function getLogs(): HttpLogEntry[] {
  return [...state().entries].reverse()
}
