'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePolling } from './PollingProvider'
import { HomeDashboard } from './HomeDashboard'
import { SetupScreen } from './SetupScreen'
import type { HueGroup } from '@/lib/types'

export function HomeDashboardShell() {
  const { ready, deviceIp, measures, history, lastUpdated, error, tempUnit, pmBatchId, outdoorAqi, handleIpSave } = usePolling()
  const [, setTick] = useState(0)
  const [groups, setGroups] = useState<HueGroup[]>([])
  const esRef = useRef<EventSource | null>(null)

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
      .then((data: { groups: HueGroup[] } | null) => {
        if (data?.groups) setGroups(data.groups)
      })
      .catch(() => { })

    const es = new EventSource('/api/lights/stream')
    esRef.current = es
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { groups?: HueGroup[] }
        if (data.groups) setGroups(data.groups)
      } catch { }
    }
    es.onerror = () => { es.close() }
    return () => { es.close() }
  }, [])

  const handleGroupToggle = useCallback((id: string, on: boolean) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, on } : g))
    fetch(`/api/lights/groups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on }),
    }).catch(() => {
      // revert optimistic update on failure
      setGroups(prev => prev.map(g => g.id === id ? { ...g, on: !on } : g))
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
      onGroupToggle={handleGroupToggle}
    />
  )
}
