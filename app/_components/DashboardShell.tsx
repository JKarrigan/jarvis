'use client'

import { useEffect, useState } from 'react'
import { usePolling } from './PollingProvider'
import { Dashboard } from './Dashboard'
import { SetupScreen } from './SetupScreen'
import { StaleBanner } from './StaleBanner'
import { PageState, Spinner } from './air/ui'
import { FadeIn } from './air/motion'
import type { DailySummary } from '@/lib/types'
import type { AirQualityEvent } from '@/lib/eventTypes'
import { eventDescription, eventRecommendation, eventTitle, severityFor } from '@/lib/eventInfo'
import { STALE_AFTER_MS, useIsOlderThan } from '@/lib/useNow'

const DEV = process.env.NODE_ENV === 'development'
const SUMMARY_REFRESH_MS = 15 * 60 * 1000
/** Development only: two made-up open alerts, to see the banner, toasts and badge. */
function mockEvents(): AirQualityEvent[] {
  const startTime = new Date(Date.now() - 8 * 60 * 1000)
  const baseline = { noxIndex: 1, tvocIndex: 90, pm02: 4.2, rco2: 870 }
  const smoke = { noxIndex: 25, tvocIndex: 430, pm02: 140, rco2: 1120 }
  const stale = { noxIndex: 1, tvocIndex: 104, pm02: 4.2, rco2: 1620 }
  const base = { startTime, endTime: null, durationMinutes: 8, baseline, confidence: 1, acknowledged: false }
  return [
    {
      ...base, id: 'dev_combustion_exhaust', type: 'combustion_exhaust', peak: smoke,
      severity: severityFor('combustion_exhaust', smoke), title: eventTitle('combustion_exhaust'),
      description: eventDescription('combustion_exhaust', smoke, baseline),
      recommendation: eventRecommendation('combustion_exhaust', 'critical'),
    },
    {
      ...base, id: 'dev_ventilation_poor', type: 'ventilation_poor', peak: stale,
      severity: severityFor('ventilation_poor', stale), title: eventTitle('ventilation_poor'),
      description: eventDescription('ventilation_poor', stale, baseline),
      recommendation: eventRecommendation('ventilation_poor', 'warning'),
    },
  ]
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
  const { ready, deviceIp, measures, history, lastUpdated, error, tempUnit, setTempUnit, pmBatchId, outdoorAqi, handleIpSave, setPreviewEvents } = usePolling()
  const dailySummaries = useDailySummaries()
  const [simulating, setSimulating] = useState(false)

  // Made-up alerts go through the provider, so the banner, toasts and badge all react.
  function simulateAlerts() {
    try { localStorage.removeItem('aq-notified') } catch { /* ignore */ }
    setPreviewEvents(mockEvents())
    setSimulating(true)
  }

  function clearAlerts() {
    setPreviewEvents([])
    setSimulating(false)
  }

  // The current reading is always a raw one from /api/latest: history entries
  // are minute averages (fractional, without model or firmware).
  const displayMeasures = measures
  const displayLastUpdated = lastUpdated
  const old = useIsOlderThan(displayLastUpdated?.getTime() ?? null, STALE_AFTER_MS)
  const stale = old || !!error

  // Each state fades in as it replaces the last (loading, setup, connecting, the dashboard).
  if (!ready) {
    return (
      <PageState><Spinner /></PageState>
    )
  }

  if (!deviceIp) {
    return <FadeIn key="setup"><SetupScreen onSave={handleIpSave} /></FadeIn>
  }

  if (!displayMeasures || !displayLastUpdated) {
    return (
      <FadeIn key="connecting">
        <PageState>
          <div className="flex flex-col items-center gap-3 text-zinc-400" role="status">
            <Spinner />
            <span className="text-sm">Connecting to {deviceIp}…</span>
            {error && (
              <span className="text-sm text-red-400">{error}. Retrying in 10 s.</span>
            )}
          </div>
        </PageState>
      </FadeIn>
    )
  }

  return (
    <FadeIn key="ready">
      <Dashboard
        measures={displayMeasures}
        history={history}
        tempUnit={tempUnit}
        onTempUnit={setTempUnit}
        pmBatchId={pmBatchId}
        outdoorAqi={outdoorAqi}
        dailySummaries={dailySummaries}
        stale={stale}
        banner={<StaleBanner lastUpdated={displayLastUpdated} error={error} stale={old} />}
        devControls={DEV ? { onSimulate: simulateAlerts, onClear: clearAlerts, hasDevEvents: simulating } : undefined}
      />
    </FadeIn>
  )
}
