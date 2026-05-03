'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { DeviceMeasures, HistoryEntry } from '@/lib/types'

const HISTORY_MAX = 3600
const POLL_MS = 10_000

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
  handleIpSave: (ip: string) => void
  handleReset: () => void
}

const PollingContext = createContext<PollingState | null>(null)

export function usePolling() {
  const ctx = useContext(PollingContext)
  if (!ctx) throw new Error('usePolling must be used within PollingProvider')
  return ctx
}

export function PollingProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [deviceIp, setDeviceIp] = useState<string | null>(null)
  const [measures, setMeasures] = useState<DeviceMeasures | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('F')
  const [pmBatchId, setPmBatchIdState] = useState<string | null>(null)
  const [outdoorAqi, setOutdoorAqi] = useState<number | null>(null)
  const [outdoorLocation, setOutdoorLocationState] = useState<{ lat: string; lon: string } | null>(null)

  // Tracks the latest reading timestamp we've already applied to avoid duplicates
  const lastTimestamp = useRef<number>(0)

  function registerWithServer(ip: string) {
    fetch('/api/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip }),
    }).catch(() => {})
  }

  useEffect(() => {
    const savedBatch = localStorage.getItem('ag-pm-batch')
    if (savedBatch) setPmBatchIdState(savedBatch)

    const savedLat = localStorage.getItem('ag-outdoor-lat')
    const savedLon = localStorage.getItem('ag-outdoor-lon')
    if (savedLat && savedLon) setOutdoorLocationState({ lat: savedLat, lon: savedLon })

    const saved = localStorage.getItem('ag-device-ip')
    const validSaved = saved && !saved.startsWith('http') ? saved : null
    const ip = validSaved ?? process.env.NEXT_PUBLIC_DEVICE_HOST ?? null
    setDeviceIp(ip)
    setReady(true)

    if (ip) registerWithServer(ip)

    // Hydrate history from SQLite so charts work immediately after load
    fetch('/api/history?limit=3600')
      .then(r => r.ok ? r.json() : [])
      .then((data: HistoryEntry[]) => {
        if (!Array.isArray(data) || data.length === 0) return
        setHistory(data)
        const latest = data[data.length - 1]
        lastTimestamp.current = latest.timestamp
        setMeasures(latest.measures)
        setLastUpdated(new Date(latest.timestamp))
      })
      .catch(() => {})
  }, [])

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch('/api/latest')
      if (!res.ok) return

      const data = await res.json() as {
        timestamp: number
        measures: DeviceMeasures
        pollerError: string | null
      }

      setError(data.pollerError)

      if (data.timestamp <= lastTimestamp.current) return
      lastTimestamp.current = data.timestamp

      setMeasures(data.measures)
      setHistory(prev => {
        const next = [...prev, { timestamp: data.timestamp, measures: data.measures }]
        return next.length > HISTORY_MAX ? next.slice(next.length - HISTORY_MAX) : next
      })
      setLastUpdated(new Date(data.timestamp))
    } catch {
      // transient network error — server poller keeps running regardless
    }
  }, [])

  useEffect(() => {
    if (!deviceIp) return
    fetchLatest()
    const id = setInterval(fetchLatest, POLL_MS)
    return () => clearInterval(id)
  }, [deviceIp, fetchLatest])

  function setPmBatchId(id: string | null) {
    if (id) localStorage.setItem('ag-pm-batch', id)
    else localStorage.removeItem('ag-pm-batch')
    setPmBatchIdState(id)
  }

  function setOutdoorLocation(loc: { lat: string; lon: string } | null) {
    if (loc) {
      localStorage.setItem('ag-outdoor-lat', loc.lat)
      localStorage.setItem('ag-outdoor-lon', loc.lon)
    } else {
      localStorage.removeItem('ag-outdoor-lat')
      localStorage.removeItem('ag-outdoor-lon')
    }
    setOutdoorLocationState(loc)
  }

  const fetchOutdoorAqi = useCallback(async () => {
    try {
      const params = outdoorLocation
        ? `?lat=${outdoorLocation.lat}&lon=${outdoorLocation.lon}`
        : ''
      const res = await fetch(`/api/outdoor-aqi${params}`)
      if (!res.ok) return
      const data = await res.json() as { aqi: number | null }
      setOutdoorAqi(data.aqi)
    } catch { /* ignore */ }
  }, [outdoorLocation])

  useEffect(() => {
    fetchOutdoorAqi()
    const id = setInterval(fetchOutdoorAqi, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchOutdoorAqi])

  function handleIpSave(ip: string) {
    registerWithServer(ip)
    setMeasures(null)
    setHistory([])
    setError(null)
    setLastUpdated(null)
    lastTimestamp.current = 0
    setDeviceIp(ip)
  }

  function handleReset() {
    localStorage.removeItem('ag-device-ip')
    setDeviceIp(null)
    setMeasures(null)
    setHistory([])
    setError(null)
    setLastUpdated(null)
    lastTimestamp.current = 0
  }

  return (
    <PollingContext.Provider value={{
      ready, deviceIp, measures, history, lastUpdated, error,
      tempUnit, setTempUnit,
      pmBatchId, setPmBatchId,
      outdoorAqi, outdoorLocation, setOutdoorLocation,
      handleIpSave, handleReset,
    }}>
      {children}
    </PollingContext.Provider>
  )
}
