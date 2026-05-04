'use client'

import { useEffect, useState } from 'react'
import { usePolling } from './PollingProvider'
import { Dashboard } from './Dashboard'
import { SetupScreen } from './SetupScreen'
import type { DailySummary } from '@/lib/types'

export function DashboardShell() {
  const { ready, deviceIp, measures, history, lastUpdated, error, tempUnit, setTempUnit, pmBatchId, outdoorAqi, handleIpSave } = usePolling()
  const [, setTick] = useState(0)
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([])

  useEffect(() => {
    fetch('/api/daily-summary')
      .then(r => r.ok ? r.json() : [])
      .then((data: DailySummary[]) => setDailySummaries(data))
      .catch(() => { })
  }, [])

  // Tick every second to keep the "Updated Xs ago" counter fresh
  useEffect(() => {
    if (!lastUpdated) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [lastUpdated])

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
    <Dashboard
      measures={displayMeasures}
      history={history}
      tempUnit={tempUnit}
      onTempToggle={() => setTempUnit(tempUnit === 'C' ? 'F' : 'C')}
      pmBatchId={pmBatchId}
      outdoorAqi={outdoorAqi}
      dailySummaries={dailySummaries}
    />
  )
}
