'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePolling } from './PollingProvider'
import { Dashboard } from './Dashboard'
import { SetupScreen } from './SetupScreen'
import { StaleBanner } from './StaleBanner'
import { Toast, useToast } from './Toast'
import type { DailySummary } from '@/lib/types'
import type { AirQualityEvent } from '@/lib/eventTypes'
import { useIsOlderThan } from '@/lib/useNow'

const DEV = process.env.NODE_ENV === 'development'
/** Values are shown as stale when the newest reading is older than this. */
export const STALE_AFTER_MS = 60_000
const SUMMARY_REFRESH_MS = 15 * 60 * 1000
/** Event ids already toasted, so a reload doesn't toast them again (bounded). */
const NOTIFIED_KEY = 'aq-notified'
const NOTIFIED_MAX = 50

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

function mockEvents(): AirQualityEvent[] {
  return [
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
}

function readNotified(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeNotified(ids: string[]): void {
  try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(ids.slice(-NOTIFIED_MAX))) } catch { /* ignore */ }
}

/** Daily AQI summaries bucketed in the browser's time zone, refreshed every 15 min. */
function useDailySummaries(): DailySummary[] {
  const [summaries, setSummaries] = useState<DailySummary[]>([])
  useEffect(() => {
    const ac = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      try {
        const res = await fetch(`/api/daily-summary?tz=${encodeURIComponent(tz)}`, { signal: ac.signal })
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data)) setSummaries(data)
        }
      } catch { /* keep the last summaries */ }
      if (!ac.signal.aborted) timer = setTimeout(load, SUMMARY_REFRESH_MS)
    }
    void load()
    return () => {
      ac.abort()
      clearTimeout(timer)
    }
  }, [])
  return summaries
}

export function DashboardShell() {
  const { ready, deviceIp, measures, history, lastUpdated, error, tempUnit, setTempUnit, pmBatchId, outdoorAqi, handleIpSave, activeEvents, acknowledgeEvent } = usePolling()
  const dailySummaries = useDailySummaries()
  const { toast, showToast, dismissToast } = useToast()
  const [devEvents, setDevEvents] = useState<AirQualityEvent[]>([])
  const notifiedIds = useRef<Set<string> | null>(null)

  const allActiveEvents = useMemo(() => [...activeEvents, ...devEvents], [activeEvents, devEvents])

  // Toast new critical/warning events once each (server ids are stable now).
  useEffect(() => {
    notifiedIds.current ??= new Set(readNotified())
    const seen = notifiedIds.current
    let changed = false
    for (const event of allActiveEvents) {
      if (seen.has(event.id) || event.acknowledged) continue
      if (event.severity !== 'critical' && event.severity !== 'warning') continue
      showToast(event.severity, event.title)
      seen.add(event.id)
      changed = true
    }
    if (changed) writeNotified([...seen])
  }, [allActiveEvents, showToast])

  function handleAcknowledge(id: string) {
    if (devEvents.some(e => e.id === id)) {
      setDevEvents(prev => prev.filter(e => e.id !== id))
    } else {
      acknowledgeEvent(id)
    }
  }

  function simulateAlerts() {
    // Forget the mock ids so their toasts fire again
    for (const e of mockEvents()) notifiedIds.current?.delete(e.id)
    setDevEvents(mockEvents())
  }

  function clearAlerts() {
    setDevEvents([])
  }

  const lastHistoryEntry = history.length > 0 ? history[history.length - 1] : null
  const displayMeasures = measures ?? lastHistoryEntry?.measures ?? null
  const displayLastUpdated = lastUpdated ?? (lastHistoryEntry ? new Date(lastHistoryEntry.timestamp) : null)
  const old = useIsOlderThan(displayLastUpdated?.getTime() ?? null, STALE_AFTER_MS)
  const stale = old || !!error

  if (!ready) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-emerald-500 animate-spin" aria-label="Loading" />
      </div>
    )
  }

  if (!deviceIp) {
    return <SetupScreen onSave={handleIpSave} />
  }

  if (!displayMeasures || !displayLastUpdated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-zinc-400" role="status">
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
        stale={stale}
        banner={<StaleBanner lastUpdated={displayLastUpdated} error={error} stale={old} />}
        devControls={DEV ? { onSimulate: simulateAlerts, onClear: clearAlerts, hasDevEvents: devEvents.length > 0 } : undefined}
      />
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  )
}
