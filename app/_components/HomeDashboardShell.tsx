'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePolling } from './PollingProvider'
import { HomeDashboard, type HomeLightsState } from './HomeDashboard'
import { SetupScreen } from './SetupScreen'
import { StaleBanner } from './StaleBanner'
import { STALE_AFTER_MS } from './DashboardShell'
import { Toast, useToast } from './Toast'
import { useHueLights } from './lights/useHueLights'
import type { LightState } from './HueControls'
import { useIsOlderThan } from '@/lib/useNow'

export function HomeDashboardShell() {
  const { ready, deviceIp, measures, history, lastUpdated, error, tempUnit, pmBatchId, outdoorAqi, handleIpSave, allEvents } = usePolling()
  const { toast, showToast, dismissToast } = useToast()
  // Shared Hue hook: SSE with automatic reconnect (the old private copy closed
  // the EventSource on the first error, so the kiosk went stale after a restart),
  // throttled commands and rollback on failure.
  const { data, error: hueError, notConfigured, connection, setLight, setGroup } = useHueLights({
    onActionError: msg => showToast('error', msg),
  })
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null)

  const hue = useMemo<HomeLightsState>(() => ({
    groups: data?.groups ?? [],
    lights: data?.lights ?? [],
    loaded: data !== null,
    error: hueError,
    notConfigured,
    connection,
  }), [data, hueError, notConfigured, connection])

  // Scroll lock while any sheet is open
  const anySheetOpen = selectedGroupId !== null || selectedLightId !== null
  useEffect(() => {
    document.body.style.overflow = anySheetOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [anySheetOpen])

  const handleGroupToggle = useCallback((id: string, on: boolean) => setGroup(id, { on }), [setGroup])
  const handleGroupBrightness = useCallback((id: string, brightness: number) => setGroup(id, { brightness }), [setGroup])
  const handleLightToggle = useCallback((id: string, on: boolean) => setLight(id, { on }), [setLight])
  const handleLightSetState = useCallback((id: string, state: LightState) => setLight(id, state), [setLight])
  const closeGroup = useCallback(() => { setSelectedGroupId(null); setSelectedLightId(null) }, [])
  const closeLight = useCallback(() => setSelectedLightId(null), [])

  const lastHistoryEntry = history.length > 0 ? history[history.length - 1] : null
  const displayMeasures = measures ?? lastHistoryEntry?.measures ?? null
  const displayLastUpdated = lastUpdated ?? (lastHistoryEntry ? new Date(lastHistoryEntry.timestamp) : null)
  const old = useIsOlderThan(displayLastUpdated?.getTime() ?? null, STALE_AFTER_MS)

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
      <HomeDashboard
        measures={displayMeasures}
        history={history}
        stale={old || !!error}
        banner={<StaleBanner lastUpdated={displayLastUpdated} error={error} stale={old} />}
        tempUnit={tempUnit}
        pmBatchId={pmBatchId}
        outdoorAqi={outdoorAqi}
        hue={hue}
        selectedGroupId={selectedGroupId}
        selectedLightId={selectedLightId}
        onGroupToggle={handleGroupToggle}
        onGroupBrightness={handleGroupBrightness}
        onGroupSelect={setSelectedGroupId}
        onGroupClose={closeGroup}
        recentEvents={allEvents}
        onLightToggle={handleLightToggle}
        onLightSetState={handleLightSetState}
        onLightSelect={setSelectedLightId}
        onLightClose={closeLight}
      />
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  )
}
