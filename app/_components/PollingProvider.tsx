'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { DeviceMeasures, HistoryEntry } from '@/lib/types'
import type { AirQualityEvent } from '@/lib/eventTypes'

const HISTORY_MAX = 3600
const POLL_MS = 10_000
const EVENTS_POLL_MS = 30_000
const OUTDOOR_POLL_MS = 15 * 60 * 1000
const EVENTS_WINDOW_MS = 24 * 60 * 60 * 1000
/** A jump bigger than this between readings means we missed some (hidden tab, sleep). */
const GAP_MS = 3 * POLL_MS

// ─── localStorage as an external store ──────────────────────────────────────

const LS_EVENT = 'ag-local-storage'

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)   // other tabs
  window.addEventListener(LS_EVENT, onChange)    // this tab
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(LS_EVENT, onChange)
  }
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* private mode / quota: setting just won't persist */ }
  window.dispatchEvent(new Event(LS_EVENT))
}

/** A localStorage value that stays in sync across components and tabs (null on the server). */
export function useLocalStorage(key: string): [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(subscribeStorage, () => readStorage(key), () => null)
  const set = useCallback((v: string | null) => writeStorage(key, v), [key])
  return [value, set]
}

const noopSubscribe = () => () => { }
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

// ─── helpers ─────────────────────────────────────────────────────────────────

type WireEvent = Omit<AirQualityEvent, 'startTime' | 'endTime'> & { startTime: string; endTime: string | null }

export function reviveEvent(e: WireEvent | AirQualityEvent): AirQualityEvent {
  return {
    ...e,
    startTime: new Date(e.startTime),
    endTime: e.endTime ? new Date(e.endTime) : null,
  }
}

async function fetchJson<T>(url: string, signal: AbortSignal, init?: RequestInit): Promise<T | null> {
  const res = await fetch(url, { ...init, signal })
  if (!res.ok) return null
  return await res.json() as T
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/** Outdoor AQI from /api/outdoor-aqi, preferring the PM2.5-only sub-index (comparable to ours). */
function pickOutdoorAqi(data: Record<string, unknown> | null): number | null {
  if (!data) return null
  for (const k of ['pm25Aqi', 'us_aqi_pm2_5', 'aqi', 'us_aqi']) {
    const v = data[k]
    if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  }
  return null
}

// ─── context ─────────────────────────────────────────────────────────────────

interface PollingState {
  ready: boolean
  deviceIp: string | null
  measures: DeviceMeasures | null
  history: HistoryEntry[]
  lastUpdated: Date | null
  error: string | null
  tempUnit: 'C' | 'F'
  setTempUnit: (unit: 'C' | 'F') => void
  pmBatchId: string | null
  setPmBatchId: (id: string | null) => void
  outdoorAqi: number | null
  outdoorLocation: { lat: string; lon: string } | null
  setOutdoorLocation: (loc: { lat: string; lon: string } | null) => void
  /** Saves the host on the server; resolves to an error message or null. */
  handleIpSave: (ip: string) => Promise<string | null>
  /** Events detected by the server poller that are still open. */
  activeEvents: AirQualityEvent[]
  /** Events from the last 24 h plus any still open, newest first. */
  allEvents: AirQualityEvent[]
  acknowledgeEvent: (id: string) => void
}

const PollingContext = createContext<PollingState | null>(null)

export function usePolling() {
  const ctx = useContext(PollingContext)
  if (!ctx) throw new Error('usePolling must be used within PollingProvider')
  return ctx
}

export function PollingProvider({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated()
  const [device, setDevice] = useState<{ loaded: boolean; ip: string | null }>({ loaded: false, ip: null })
  const [measures, setMeasures] = useState<DeviceMeasures | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<AirQualityEvent[]>([])
  const [outdoorAqi, setOutdoorAqi] = useState<number | null>(null)

  const [tempUnitRaw, setTempUnitRaw] = useLocalStorage('ag-temp-unit')
  const [pmBatchId, setPmBatchIdRaw] = useLocalStorage('ag-pm-batch')
  const [outdoorLat, setOutdoorLat] = useLocalStorage('ag-outdoor-lat')
  const [outdoorLon, setOutdoorLon] = useLocalStorage('ag-outdoor-lon')

  const tempUnit: 'C' | 'F' = tempUnitRaw === 'C' ? 'C' : 'F'
  const deviceIp = device.ip

  // Newest reading timestamp applied so far
  const lastTimestamp = useRef(0)

  // ── Device host: the server is the source of truth ─────────────────────────
  useEffect(() => {
    const ac = new AbortController()
    const legacyHost = () => {
      const saved = readStorage('ag-device-ip')
      const host = saved && !saved.startsWith('http') ? saved : process.env.NEXT_PUBLIC_DEVICE_HOST ?? null
      return host || null
    }
    fetchJson<{ ip: string | null }>('/api/device', ac.signal)
      .then(status => {
        if (status?.ip) {
          setDevice({ loaded: true, ip: status.ip })
          return
        }
        // One-time migration of a host saved only in this browser.
        const legacy = legacyHost()
        if (legacy) {
          fetch('/api/device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: legacy }),
          }).catch(() => { })
        }
        setDevice({ loaded: true, ip: legacy })
      })
      .catch(err => {
        if (isAbort(err)) return
        setDevice({ loaded: true, ip: legacyHost() })
      })
    return () => ac.abort()
  }, [])

  // ── Readings: hydrate from SQLite, then poll /api/latest ───────────────────
  useEffect(() => {
    if (!deviceIp) return
    const ac = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let inFlight = false
    let stopped = false

    const append = (entries: HistoryEntry[]) => {
      const fresh = entries.filter(e => e.timestamp > lastTimestamp.current)
      if (fresh.length === 0) return
      const newest = fresh[fresh.length - 1]
      lastTimestamp.current = newest.timestamp
      setHistory(prev => {
        const next = prev.concat(fresh)
        return next.length > HISTORY_MAX ? next.slice(next.length - HISTORY_MAX) : next
      })
      setMeasures(newest.measures)
      setLastUpdated(new Date(newest.timestamp))
    }

    const poll = async () => {
      const latest = await fetchJson<HistoryEntry & { pollerError: string | null }>('/api/latest', ac.signal)
      if (!latest) return
      setError(latest.pollerError)
      const last = lastTimestamp.current
      if (latest.timestamp <= last) return
      if (last > 0 && latest.timestamp - last > GAP_MS) {
        // Missed readings (tab was hidden, laptop slept): backfill the gap.
        const missing = await fetchJson<HistoryEntry[]>(`/api/history?from=${last + 1}&to=${latest.timestamp}`, ac.signal)
        if (Array.isArray(missing) && missing.length > 0) append(missing)
      }
      append([{ timestamp: latest.timestamp, measures: latest.measures }])
    }

    const tick = async () => {
      clearTimeout(timer)
      if (stopped) return
      if (!document.hidden && !inFlight) {
        inFlight = true
        try {
          await poll()
        } catch (err) {
          if (!isAbort(err)) setError('Cannot reach the dashboard server')
        } finally {
          inFlight = false
        }
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS)
    }

    const start = async () => {
      try {
        const data = await fetchJson<HistoryEntry[]>(`/api/history?limit=${HISTORY_MAX}`, ac.signal)
        if (Array.isArray(data) && data.length > 0) {
          lastTimestamp.current = 0
          setHistory([])
          append(data)
        }
      } catch (err) {
        if (isAbort(err)) return
      }
      void tick()
    }

    const onVisible = () => { if (!document.hidden) void tick() }
    document.addEventListener('visibilitychange', onVisible)
    void start()
    return () => {
      stopped = true
      ac.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      lastTimestamp.current = 0
    }
  }, [deviceIp])

  // ── Events: read-only view of what the server detected ─────────────────────
  useEffect(() => {
    if (!deviceIp) return
    const ac = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    const tick = async () => {
      clearTimeout(timer)
      if (stopped) return
      if (!document.hidden) {
        try {
          const data = await fetchJson<WireEvent[]>(`/api/events?since=${Date.now() - EVENTS_WINDOW_MS}&limit=200`, ac.signal)
          if (Array.isArray(data)) setEvents(data.map(reviveEvent))
        } catch { /* keep the last list */ }
      }
      if (!stopped) timer = setTimeout(tick, EVENTS_POLL_MS)
    }
    const onVisible = () => { if (!document.hidden) void tick() }
    document.addEventListener('visibilitychange', onVisible)
    void tick()
    return () => {
      stopped = true
      ac.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [deviceIp])

  // ── Outdoor AQI ────────────────────────────────────────────────────────────
  useEffect(() => {
    const ac = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      const qs = outdoorLat && outdoorLon
        ? `?lat=${encodeURIComponent(outdoorLat)}&lon=${encodeURIComponent(outdoorLon)}`
        : ''
      try {
        setOutdoorAqi(pickOutdoorAqi(await fetchJson<Record<string, unknown>>(`/api/outdoor-aqi${qs}`, ac.signal)))
      } catch { /* keep last value */ }
      timer = setTimeout(tick, OUTDOOR_POLL_MS)
    }
    void tick()
    return () => {
      ac.abort()
      clearTimeout(timer)
    }
  }, [outdoorLat, outdoorLon])

  // ── Actions ────────────────────────────────────────────────────────────────
  const setTempUnit = useCallback((unit: 'C' | 'F') => setTempUnitRaw(unit), [setTempUnitRaw])
  const setPmBatchId = useCallback((id: string | null) => setPmBatchIdRaw(id), [setPmBatchIdRaw])
  const setOutdoorLocation = useCallback((loc: { lat: string; lon: string } | null) => {
    setOutdoorLat(loc?.lat ?? null)
    setOutdoorLon(loc?.lon ?? null)
  }, [setOutdoorLat, setOutdoorLon])

  const acknowledgeEvent = useCallback((id: string) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, acknowledged: true } : e))
    fetch(`/api/events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acknowledged: true }),
    }).catch(() => { })
  }, [])

  const handleIpSave = useCallback(async (ip: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      })
      const body = await res.json().catch(() => null) as { ip?: string; error?: string } | null
      if (!res.ok) return body?.error ?? 'Could not save the device address'
      writeStorage('ag-device-ip', null) // the server owns it now
      setMeasures(null)
      setHistory([])
      setError(null)
      setLastUpdated(null)
      setDevice({ loaded: true, ip: body?.ip ?? ip })
      return null
    } catch {
      return 'Cannot reach the dashboard server'
    }
  }, [])

  const outdoorLocation = useMemo(
    () => (outdoorLat && outdoorLon ? { lat: outdoorLat, lon: outdoorLon } : null),
    [outdoorLat, outdoorLon],
  )
  const activeEvents = useMemo(() => events.filter(e => e.endTime === null), [events])

  const value = useMemo<PollingState>(() => ({
    ready: hydrated && device.loaded,
    deviceIp,
    measures, history, lastUpdated, error,
    tempUnit, setTempUnit,
    pmBatchId, setPmBatchId,
    outdoorAqi, outdoorLocation, setOutdoorLocation,
    handleIpSave,
    activeEvents, allEvents: events, acknowledgeEvent,
  }), [
    hydrated, device.loaded, deviceIp, measures, history, lastUpdated, error,
    tempUnit, setTempUnit, pmBatchId, setPmBatchId, outdoorAqi, outdoorLocation, setOutdoorLocation,
    handleIpSave, activeEvents, events, acknowledgeEvent,
  ])

  return (
    <PollingContext.Provider value={value}>
      {children}
    </PollingContext.Provider>
  )
}
