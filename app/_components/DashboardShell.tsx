'use client'

import { useEffect, useRef, useState } from 'react'
import { usePolling } from './PollingProvider'
import { Dashboard } from './Dashboard'
import { SetupScreen } from './SetupScreen'
import { Toast, useToast } from './Toast'
import type { DailySummary } from '@/lib/types'
import type { AirQualityEvent } from '@/lib/eventTypes'

const DEV = process.env.NODE_ENV === 'development'

function makeMockEvent(overrides: Partial<AirQualityEvent> & Pick<AirQualityEvent, 'id' | 'type' | 'severity' | 'title' | 'description'>): AirQualityEvent {
  const now = new Date()
  return {
    startTime: new Date(now.getTime() - 8 * 60 * 1000),
    endTime: null,
    durationMinutes: 8,
    peak: { noxIndex: 245, tvocIndex: 230, pm02: 18.4, rco2: 1120 },
    baseline: { noxIndex: 101, tvocIndex: 102, pm02: 4.2, rco2: 870 },
    recommendation: null,
    confidence: 0.78,
    acknowledged: false,
    ...overrides,
  }
}

const MOCK_EVENTS: AirQualityEvent[] = [
  makeMockEvent({
    id: 'dev_combustion_exhaust',
    type: 'combustion_exhaust',
    severity: 'critical',
    title: 'Possible combustion exhaust',
    description: 'NOx (245), PM2.5 (18.4 μg/m³), and VOC rose together — a pattern consistent with combustion products entering the room.',
    recommendation: 'Check stove venting. Open windows. Check your CO detector.',
  }),
  makeMockEvent({
    id: 'dev_ventilation_poor',
    type: 'ventilation_poor',
    severity: 'warning',
    title: 'Poor ventilation',
    description: 'CO₂ reached 1120 ppm. The room has insufficient fresh air for current occupancy.',
    recommendation: 'Open a window or increase fresh air intake.',
    peak: { noxIndex: 101, tvocIndex: 104, pm02: 4.2, rco2: 1120 },
  }),
]

export function DashboardShell() {
  const { ready, deviceIp, measures, history, lastUpdated, error, tempUnit, setTempUnit, pmBatchId, outdoorAqi, handleIpSave, activeEvents, acknowledgeEvent } = usePolling()
  const [, setTick] = useState(0)
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([])
  const { toast, showToast, dismissToast } = useToast()
  const notifiedIds = useRef<Set<string>>(new Set())
  const [devEvents, setDevEvents] = useState<AirQualityEvent[]>([])

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

  const allActiveEvents = [...activeEvents, ...devEvents]

  // Fire toasts for new critical/warning events, deduplicated by event ID
  useEffect(() => {
    for (const event of allActiveEvents) {
      if (notifiedIds.current.has(event.id)) continue
      if (event.acknowledged) continue
      if (event.severity === 'critical' || event.severity === 'warning') {
        if (localStorage.getItem(`aq-notified-${event.id}`)) {
          notifiedIds.current.add(event.id)
          continue
        }
        showToast(event.severity, event.title)
        localStorage.setItem(`aq-notified-${event.id}`, '1')
        notifiedIds.current.add(event.id)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allActiveEvents.map(e => e.id).join(','), showToast])

  function handleAcknowledge(id: string) {
    if (devEvents.find(e => e.id === id)) {
      setDevEvents(prev => prev.filter(e => e.id !== id))
    } else {
      acknowledgeEvent(id)
    }
  }

  function simulateAlerts() {
    const fresh = MOCK_EVENTS.map(e => ({ ...e, startTime: new Date(Date.now() - 8 * 60 * 1000) }))
    setDevEvents(fresh)
    // Clear notified flags so toasts fire again
    for (const e of fresh) {
      localStorage.removeItem(`aq-notified-${e.id}`)
      notifiedIds.current.delete(e.id)
    }
  }

  function clearAlerts() {
    setDevEvents([])
    for (const e of MOCK_EVENTS) {
      localStorage.removeItem(`aq-notified-${e.id}`)
      notifiedIds.current.delete(e.id)
    }
  }

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
    <>
      <Dashboard
        measures={displayMeasures}
        history={history}
        tempUnit={tempUnit}
        onTempToggle={() => setTempUnit(tempUnit === 'C' ? 'F' : 'C')}
        pmBatchId={pmBatchId}
        outdoorAqi={outdoorAqi}
        dailySummaries={dailySummaries}
        activeEvents={allActiveEvents}
        onAcknowledgeEvent={handleAcknowledge}
        devControls={DEV ? { onSimulate: simulateAlerts, onClear: clearAlerts, hasDevEvents: devEvents.length > 0 } : undefined}
      />
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  )
}
