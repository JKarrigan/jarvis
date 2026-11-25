'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePolling } from './PollingProvider'
import { HomeDashboard, type HomeLightsState } from './HomeDashboard'
import { SetupScreen } from './SetupScreen'
import { StaleBanner } from './StaleBanner'
import { PageState, Spinner } from './air/ui'
import { FadeIn } from './air/motion'
import { Toast, useToast } from './Toast'
import { useHueLights } from './lights/useHueLights'
import type { LightState } from './HueControls'
import { STALE_AFTER_MS, useIsOlderThan } from '@/lib/useNow'

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

  // The current reading is always a raw one from /api/latest: history entries
  // are minute averages (fractional, without model or firmware).
  const displayMeasures = measures
  const displayLastUpdated = lastUpdated
  const old = useIsOlderThan(displayLastUpdated?.getTime() ?? null, STALE_AFTER_MS)

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
    <>
      <FadeIn key="ready">
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
      </FadeIn>
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  )
}
