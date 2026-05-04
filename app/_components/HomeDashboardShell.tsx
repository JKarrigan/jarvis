'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePolling } from './PollingProvider'
import { HomeDashboard } from './HomeDashboard'
import { SetupScreen } from './SetupScreen'
import type { HueGroup, HueLight } from '@/lib/types'
import type { LightState } from './HueControls'

type PendingState = Partial<Pick<HueLight, 'on' | 'brightness' | 'colorTemp' | 'hue' | 'saturation'>>

export function HomeDashboardShell() {
  const { ready, deviceIp, measures, history, lastUpdated, error, tempUnit, pmBatchId, outdoorAqi, handleIpSave } = usePolling()
  const [, setTick] = useState(0)
  const [groups, setGroups] = useState<HueGroup[]>([])
  const [lights, setLights] = useState<HueLight[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const pendingRef = useRef<Map<string, { state: PendingState; until: number }>>(new Map())

  function addPending(key: string, ps: PendingState, ms = 1500) {
    pendingRef.current.set(key, { state: ps, until: Date.now() + ms })
  }

  function mergePendingGroups(incoming: HueGroup[]): HueGroup[] {
    const now = Date.now()
    return incoming.map(g => {
      const p = pendingRef.current.get(`g:${g.id}`)
      if (!p || p.until < now) {
        pendingRef.current.delete(`g:${g.id}`)
        return g
      }
      return { ...g, ...p.state }
    })
  }

  function mergePendingLights(incoming: HueLight[]): HueLight[] {
    const now = Date.now()
    return incoming.map(l => {
      const p = pendingRef.current.get(`l:${l.id}`)
      if (!p || p.until < now) {
        pendingRef.current.delete(`l:${l.id}`)
        return l
      }
      return { ...l, ...p.state }
    })
  }

  // Keep "Updated Xs ago" counter fresh
  useEffect(() => {
    if (!lastUpdated) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [lastUpdated])

  // Fetch initial lights state then stream updates
  useEffect(() => {
    fetch('/api/lights')
      .then(r => r.ok ? r.json() : null)
      .then((data: { lights: HueLight[]; groups: HueGroup[] } | null) => {
        if (data?.groups) setGroups(data.groups)
        if (data?.lights) setLights(data.lights)
      })
      .catch(() => { })

    const es = new EventSource('/api/lights/stream')
    esRef.current = es
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { lights?: HueLight[]; groups?: HueGroup[] }
        if (data.groups) setGroups(mergePendingGroups(data.groups))
        if (data.lights) setLights(mergePendingLights(data.lights))
      } catch { }
    }
    es.onerror = () => { es.close() }
    return () => { es.close() }
  }, [])

  // Scroll lock while any modal is open
  useEffect(() => {
    document.body.style.overflow =
      selectedGroupId !== null || selectedLightId !== null ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [selectedGroupId, selectedLightId])

  const handleGroupToggle = useCallback((id: string, on: boolean) => {
    addPending(`g:${id}`, { on })
    setGroups(prev => prev.map(g => g.id === id ? { ...g, on } : g))
    fetch(`/api/lights/groups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on }),
    }).catch(() => {
      pendingRef.current.delete(`g:${id}`)
      setGroups(prev => prev.map(g => g.id === id ? { ...g, on: !on } : g))
    })
  }, [])

  const handleGroupBrightness = useCallback((id: string, brightness: number) => {
    addPending(`g:${id}`, { brightness })
    setGroups(prev => prev.map(g => g.id === id ? { ...g, brightness } : g))
    fetch(`/api/lights/groups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brightness }),
    }).catch(() => {
      pendingRef.current.delete(`g:${id}`)
    })
  }, [])

  const handleLightToggle = useCallback((id: string, on: boolean) => {
    addPending(`l:${id}`, { on })
    setLights(prev => prev.map(l => l.id === id ? { ...l, on } : l))
    fetch(`/api/lights/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on }),
    }).catch(() => {
      pendingRef.current.delete(`l:${id}`)
      setLights(prev => prev.map(l => l.id === id ? { ...l, on: !on } : l))
    })
  }, [])

  const handleLightSetState = useCallback((id: string, state: LightState) => {
    addPending(`l:${id}`, state)
    setLights(prev => prev.map(l => l.id === id ? { ...l, ...state } : l))
    fetch(`/api/lights/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }).catch(() => {
      pendingRef.current.delete(`l:${id}`)
    })
  }, [])

  if (!ready) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-emerald-500 animate-spin" />
      </div>
    )
  }

  if (!deviceIp) {
    return <SetupScreen onSave={handleIpSave} />
  }

  const lastHistoryEntry = history.length > 0 ? history[history.length - 1] : null
  const displayMeasures = measures ?? lastHistoryEntry?.measures ?? null
  const displayLastUpdated = lastUpdated ?? (lastHistoryEntry ? new Date(lastHistoryEntry.timestamp) : null)

  if (!displayMeasures || !displayLastUpdated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-zinc-600">
          <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-emerald-500 animate-spin" />
          <span className="text-sm">Connecting to {deviceIp}…</span>
          {error && (
            <span className="text-xs text-red-400">{error} · retrying in 10s</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <HomeDashboard
      measures={displayMeasures}
      history={history}
      lastUpdated={displayLastUpdated}
      error={error}
      tempUnit={tempUnit}
      pmBatchId={pmBatchId}
      outdoorAqi={outdoorAqi}
      groups={groups}
      lights={lights}
      selectedGroupId={selectedGroupId}
      selectedLightId={selectedLightId}
      onGroupToggle={handleGroupToggle}
      onGroupBrightness={handleGroupBrightness}
      onGroupSelect={setSelectedGroupId}
      onGroupClose={() => { setSelectedGroupId(null); setSelectedLightId(null) }}
      onLightToggle={handleLightToggle}
      onLightSetState={handleLightSetState}
      onLightSelect={setSelectedLightId}
      onLightClose={() => setSelectedLightId(null)}
    />
  )
}
