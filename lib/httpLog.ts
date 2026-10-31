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

/**
 * Newest first. `sinceId` returns only entries newer than that id (incremental
 * polling); `limit` caps the count.
 */
export function getLogs({ sinceId = 0, limit = MAX_ENTRIES }: { sinceId?: number; limit?: number } = {}): HttpLogEntry[] {
  const out: HttpLogEntry[] = []
  const entries = state().entries
  for (let i = entries.length - 1; i >= 0 && out.length < limit; i--) {
    if (entries[i].id <= sinceId) break
    out.push(entries[i])
  }
  return out
}
