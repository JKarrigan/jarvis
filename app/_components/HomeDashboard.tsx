'use client'

import { memo, useMemo } from 'react'
import Link from 'next/link'
import { AnimatePresence } from 'framer-motion'
import type { DeviceMeasures, HistoryEntry, HueGroup, HueLight } from '@/lib/types'
import type { AirQualityEvent } from '@/lib/eventTypes'
import { co2Status, tempStatus, humidityStatus, tvocStatus } from '@/lib/thresholds'
import { effectivePm25, findPmBatch } from '@/lib/pmCalibration'
import { metricStatusLabel } from '@/lib/metrics'
import { useNowMinute } from '@/lib/useNow'
import { Chart } from './Chart'
import { Clock, DateLabel } from './Clock'
import { MetricCard } from './MetricCard'
import { AqiPanel, buildSeries, toUnit } from './Dashboard'
import {
  type LightState,
  GroupBrightnessSlider,
  Toggle,
  RoomModal,
  LightModal,
} from './HueControls'
import type { LightsConnection } from './lights/useHueLights'

export interface HomeLightsState {
  groups: HueGroup[]
  lights: HueLight[]
  loaded: boolean
  error: string | null
  notConfigured: boolean
  connection: LightsConnection
}

interface HomeDashboardProps {
  measures: DeviceMeasures
  history: HistoryEntry[]
  stale: boolean
  banner?: React.ReactNode
  tempUnit: 'C' | 'F'
  pmBatchId: string | null
  outdoorAqi: number | null
  hue: HomeLightsState
  selectedGroupId: string | null
  selectedLightId: string | null
  onGroupToggle: (id: string, on: boolean) => void
  onGroupBrightness: (id: string, bri: number) => void
  onGroupSelect: (id: string) => void
  onGroupClose: () => void
  recentEvents: AirQualityEvent[]
  onLightToggle: (id: string, on: boolean) => void
  onLightSetState: (id: string, state: LightState) => void
  onLightSelect: (id: string) => void
  onLightClose: () => void
}

const EVENT_COLOR: Record<string, string> = {
  critical: '#dc2626',
  warning: '#f59e0b',
  notable: '#3b82f6',
  info: '#9ca3af',
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Card layout: the whole row is a real <button> stretched underneath the
 * content (focusable and announced); the switch and slider sit above it,
 * since interactive elements can't be nested inside a button.
 */
const stretchedButtonCls = 'absolute inset-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400'

const DashboardGroupRow = memo(function DashboardGroupRow({
  group,
  onToggle,
  onBrightness,
  onOpen,
}: {
  group: HueGroup
  onToggle: (id: string, on: boolean) => void
  onBrightness: (id: string, bri: number) => void
  onOpen: (id: string) => void
}) {
  const lightCount = `${group.lightIds.length} light${group.lightIds.length !== 1 ? 's' : ''}`
  return (
    <div className="relative flex flex-col px-4 py-3 gap-2 hover:bg-zinc-900/60 transition-colors">
      <button
        type="button"
        onClick={() => onOpen(group.id)}
        aria-haspopup="dialog"
        aria-label={`${group.name}, ${group.on ? lightCount : 'off'}`}
        className={stretchedButtonCls}
      />
      <div className="relative flex items-center justify-between gap-3 pointer-events-none">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-200 truncate">{group.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{group.on ? lightCount : 'Off'}</p>
        </div>
        <div className="pointer-events-auto">
          <Toggle on={group.on} disabled={false} onToggle={() => onToggle(group.id, !group.on)} label={`${group.name} lights`} />
        </div>
      </div>
      {group.on && (
        <div className="relative">
          <GroupBrightnessSlider group={group} onBrightness={onBrightness} />
        </div>
      )}
    </div>
  )
})

/** Last-24-h events; re-renders once a minute for the "x min ago" labels. */
const RecentEvents = memo(function RecentEvents({ events }: { events: AirQualityEvent[] }) {
  const nowMs = useNowMinute()
  const recent = useMemo(() => {
    if (nowMs == null) return []
    const cutoff = nowMs - DAY_MS
    const byId = new Map<string, AirQualityEvent>()
    for (const e of events) {
      if ((e.startTime.getTime() >= cutoff || e.endTime === null) && e.confidence >= 0.5) byId.set(e.id, e)
    }
    return [...byId.values()]
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, 5)
  }, [events, nowMs])
  if (nowMs == null || recent.length === 0) return null

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/60">
      <div className="px-4 py-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Events · last 24 h</h2>
        <Link href="/events" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">All →</Link>
      </div>
      {recent.map(e => {
        const eColor = EVENT_COLOR[e.severity]
        const mins = Math.max(0, Math.round((nowMs - e.startTime.getTime()) / 60000))
        const ago = mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`
        return (
          <Link key={e.id} href={`/events/${encodeURIComponent(e.id)}`} className="px-4 py-3 flex gap-3 hover:bg-zinc-900/60 transition-colors">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: eColor }} aria-hidden="true" />
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-200 truncate">{e.title}</span>
                {!e.endTime && <span className="text-xs text-emerald-500 animate-pulse shrink-0">ongoing</span>}
                <span className="text-xs text-zinc-500 shrink-0 tabular-nums ml-auto">{ago}</span>
              </div>
              {e.description && (
                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{e.description}</p>
              )}
            </div>
          </Link>
        )
      })}
    </section>
  )
})

export function HomeDashboard({
  measures, history, stale, banner, tempUnit, pmBatchId, outdoorAqi,
  recentEvents, hue, selectedGroupId, selectedLightId,
  onGroupToggle, onGroupBrightness, onGroupSelect, onGroupClose,
  onLightToggle, onLightSetState, onLightSelect, onLightClose,
}: HomeDashboardProps) {
  const pmBatch = findPmBatch(pmBatchId)
  const pm02 = effectivePm25(measures, pmBatch)
  const temp = measures.atmpCompensated ?? measures.atmp
  const hum = measures.rhumCompensated ?? measures.rhum

  const series = useMemo(() => buildSeries(history, pmBatch, tempUnit), [history, pmBatch, tempUnit])

  const { groups, lights } = hue
  const selectedGroup = groups.find(g => g.id === selectedGroupId) ?? null
  const selectedLight = lights.find(l => l.id === selectedLightId) ?? null
  const roomLights = useMemo(
    () => (selectedGroup ? lights.filter(l => selectedGroup.lightIds.includes(l.id)) : []),
    [lights, selectedGroup],
  )

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── Left: Air Quality ── */}
          <div className="flex-1 min-w-0 space-y-3">
            {banner}

            {/* Time · Date · AQI */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/40 px-5 py-4">
                <Clock />
              </div>
              <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/40 px-5 py-4">
                <DateLabel weekdayClass="text-xl font-semibold text-zinc-100 leading-tight" dateClass="mt-1 text-sm text-zinc-400" />
              </div>
              <AqiPanel
                pm25={pm02}
                outdoorAqi={outdoorAqi}
                stale={stale}
                className="flex flex-col justify-center gap-2 px-5 py-4 rounded-2xl border border-zinc-800 bg-zinc-900/40"
              />
            </div>

            {/* Metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                label="Temperature"
                value={Number.isFinite(temp) ? toUnit(temp, tempUnit).toFixed(1) : '—'}
                unit={`°${tempUnit}`}
                status={tempStatus(temp)}
                statusLabel={metricStatusLabel('temperature', tempStatus(temp))}
                history={series.temp}
                stale={stale}
              />
              <MetricCard
                label="Humidity"
                value={Number.isFinite(hum) ? hum.toFixed(0) : '—'}
                unit="%"
                status={humidityStatus(hum)}
                statusLabel={metricStatusLabel('humidity', humidityStatus(hum))}
                history={series.hum}
                stale={stale}
              />
              <MetricCard
                label="CO₂"
                value={measures.rco2}
                unit="ppm"
                status={co2Status(measures.rco2)}
                statusLabel={metricStatusLabel('co2', co2Status(measures.rco2))}
                history={series.co2}
                stale={stale}
              />
              <MetricCard
                label="TVOC"
                value={measures.tvocIndex}
                unit="idx"
                status={tvocStatus(measures.tvocIndex)}
                statusLabel={metricStatusLabel('tvoc', tvocStatus(measures.tvocIndex))}
                history={series.tvoc}
                stale={stale}
              />
            </div>

            {/* CO₂ chart */}
            {series.ts.length > 1 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 px-1">CO₂ History</h2>
                <Chart
                  label="CO₂"
                  unit="ppm"
                  values={series.co2}
                  timestamps={series.ts}
                  status={co2Status(measures.rco2)}
                  statusFn={co2Status}
                  muted={stale}
                />
              </section>
            )}

            <RecentEvents events={recentEvents} />
          </div>

          {/* ── Right: Lights ── */}
          <div className="w-full lg:w-72 shrink-0 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Lights</h2>
              <Link href="/lights" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Manage →
              </Link>
            </div>

            {hue.connection === 'reconnecting' && hue.loaded && (
              <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                {hue.error ? `${hue.error} — ` : ''}Reconnecting… values may be out of date.
              </p>
            )}

            {hue.notConfigured ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 flex flex-col items-center gap-2">
                <span className="text-sm text-zinc-400">No lights configured</span>
                <Link href="/settings" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                  Set up Hue Bridge →
                </Link>
              </div>
            ) : !hue.loaded ? (
              hue.error ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center" role="alert">
                  <p className="text-sm text-red-400">{hue.error}</p>
                  <p className="text-xs text-zinc-500 mt-1">Retrying automatically…</p>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 h-32 animate-pulse" aria-busy="true" aria-label="Loading lights" />
              )
            ) : groups.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center">
                <span className="text-sm text-zinc-400">No rooms found on the bridge</span>
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden divide-y divide-zinc-800">
                {groups.map(group => (
                  <DashboardGroupRow
                    key={group.id}
                    group={group}
                    onToggle={onGroupToggle}
                    onBrightness={onGroupBrightness}
                    onOpen={onGroupSelect}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      </main>

      <AnimatePresence>
        {selectedGroup && (
          <RoomModal
            key={selectedGroup.id}
            group={selectedGroup}
            lights={roomLights}
            selectedLightId={selectedLightId}
            onClose={onGroupClose}
            onGroupToggle={onGroupToggle}
            onGroupBrightness={onGroupBrightness}
            onLightToggle={onLightToggle}
            onLightSelect={onLightSelect}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedLight && (
          <LightModal
            key={selectedLight.id}
            light={selectedLight}
            onClose={onLightClose}
            onSetState={state => onLightSetState(selectedLight.id, state)}
            onToggle={() => onLightToggle(selectedLight.id, !selectedLight.on)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
