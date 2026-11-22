'use client'

import { memo, useMemo } from 'react'
import Link from 'next/link'
import { AnimatePresence } from 'framer-motion'
import type { DeviceMeasures, HistoryEntry, HueGroup, HueLight } from '@/lib/types'
import type { AirQualityEvent } from '@/lib/eventTypes'
import { co2Status, tempStatus, humidityStatus, tvocStatus, pm25Status, noxStatus } from '@/lib/thresholds'
import { effectivePm25, findPmBatch } from '@/lib/pmCalibration'
import { useNowMinute } from '@/lib/useNow'
import { Chart } from './Chart'
import { Clock, DateLine } from './Clock'
import { MetricStrip, metricReading, type MetricReading } from './MetricCard'
import { attentionLine, outdoorLine } from './AqiSummary'
import { buildSeries, toUnit } from './Dashboard'
import { cardCls, SectionTitle } from './air/ui'
import { computeAqi } from '@/lib/aqi'
import { STATUS_COLORS } from '@/lib/statusColors'
import { type LightState, briPct, RoomModal, LightModal } from './HueControls'
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
    <section aria-label="Recent events" className={`${cardCls} overflow-hidden`}>
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <SectionTitle>Events in the last 24 hours</SectionTitle>
        <Link href="/events" className="inline-flex min-h-8 items-center text-sm text-zinc-400 transition-colors hover:text-white">All events</Link>
      </div>
      <div className="divide-y divide-air-line">
        {recent.map(e => {
          const mins = Math.max(0, Math.round((nowMs - e.startTime.getTime()) / 60000))
          const ago = mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`
          return (
            <Link key={e.id} href={`/events/${encodeURIComponent(e.id)}`} className="flex gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.03]">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: EVENT_COLOR[e.severity] }} aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-zinc-100">{e.title}</span>
                  {!e.endTime && <span className="shrink-0 text-sm text-emerald-400">ongoing</span>}
                  <span className="ml-auto shrink-0 text-sm tabular-nums text-zinc-400">{ago}</span>
                </div>
                {e.description && <p className="line-clamp-2 text-sm leading-relaxed text-zinc-400">{e.description}</p>}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
})

const BULB_D = 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z'

/**
 * Room tile: the whole tile is the on/off switch (a real switch stretched underneath
 * the content, big enough to hit from across the room on the wall display); the
 * button on the right opens the room sheet for brightness and individual lights.
 */
const RoomTile = memo(function RoomTile({ group, onToggle, onOpen }: {
  group: HueGroup
  onToggle: (id: string, on: boolean) => void
  onOpen: (id: string) => void
}) {
  const count = `${group.lightIds.length} light${group.lightIds.length !== 1 ? 's' : ''}`
  return (
    <div className={`relative flex min-h-[76px] items-center gap-4 rounded-[26px] border pl-5 pr-2.5 transition-colors md:min-h-[88px] ${
      group.on ? 'border-amber-400/50 bg-[#1c170c]' : 'border-white/10 bg-air-card hover:border-white/20'
    }`}>
      <button
        type="button"
        role="switch"
        aria-checked={group.on}
        aria-label={`${group.name} lights`}
        onClick={() => onToggle(group.id, !group.on)}
        className="absolute inset-0 cursor-pointer rounded-[26px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      />
      <svg aria-hidden="true" viewBox="0 0 24 24" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
        className={`pointer-events-none relative h-7 w-7 shrink-0 ${group.on ? 'fill-amber-400 stroke-amber-400' : 'fill-none stroke-zinc-400'}`}>
        <path d={BULB_D} />
      </svg>
      <div className="pointer-events-none relative min-w-0 flex-1">
        <p className="truncate text-[17px] font-semibold text-zinc-50">{group.name}</p>
        <p className={`truncate text-sm ${group.on ? 'text-amber-200/80' : 'text-zinc-400'}`}>
          {group.on ? `On · ${briPct(group.brightness)}` : 'Off'} · {count}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onOpen(group.id)}
        aria-haspopup="dialog"
        aria-label={`${group.name}: brightness and lights`}
        className="relative grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h.01M12 12h.01M19 12h.01" /></svg>
      </button>
    </div>
  )
})

export function HomeDashboard({
  measures, history, stale, banner, tempUnit, pmBatchId, outdoorAqi,
  recentEvents, hue, selectedGroupId, selectedLightId,
  onGroupToggle, onGroupBrightness, onGroupSelect, onGroupClose,
  onLightToggle, onLightSetState, onLightSelect, onLightClose,
}: HomeDashboardProps) {
  // Memoized so the compiler treats the batch as immutable for the series memos below.
  const pmBatch = useMemo(() => findPmBatch(pmBatchId), [pmBatchId])
  const pm02 = effectivePm25(measures, pmBatch)
  const temp = measures.atmpCompensated ?? measures.atmp
  const hum = measures.rhumCompensated ?? measures.rhum

  const series = useMemo(() => buildSeries(history, pmBatch, tempUnit), [history, pmBatch, tempUnit])

  const aqi = computeAqi(pm02)
  const aqiStyle = STATUS_COLORS[aqi.color]

  const readings: MetricReading[] = [
    metricReading('temperature', 'Temperature', Number.isFinite(temp) ? toUnit(temp, tempUnit).toFixed(1) : '—', `°${tempUnit}`, tempStatus(temp), series.temp),
    metricReading('humidity', 'Humidity', Number.isFinite(hum) ? hum.toFixed(0) : '—', '%', humidityStatus(hum), series.hum),
    metricReading('co2', 'CO₂', measures.rco2, 'ppm', co2Status(measures.rco2), series.co2),
    metricReading('pm25', 'PM2.5', Number.isFinite(pm02) ? pm02.toFixed(1) : '—', 'µg/m³', pm25Status(pm02), series.pm25),
    metricReading('tvoc', 'TVOC', measures.tvocIndex, 'index', tvocStatus(measures.tvocIndex), series.tvoc),
    metricReading('nox', 'NOx', measures.noxIndex, 'index', noxStatus(measures.noxIndex), series.nox),
  ]

  const outside = outdoorLine(aqi.value, outdoorAqi)
  const attention = attentionLine(readings.filter(r => r.status !== 'good').map(r => r.label))

  const { groups, lights } = hue
  const selectedGroup = groups.find(g => g.id === selectedGroupId) ?? null
  const selectedLight = lights.find(l => l.id === selectedLightId) ?? null
  const roomLights = useMemo(
    () => (selectedGroup ? lights.filter(l => selectedGroup.lightIds.includes(l.id)) : []),
    [lights, selectedGroup],
  )

  return (
    <div className="relative">
      {/* A faint wash in the colour of the current air quality: the room's state at a glance. */}
      {!stale && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[560px] transition-[background] duration-700"
          style={{ background: `radial-gradient(70% 100% at 88% 0%, ${aqiStyle.hex}1c 0%, transparent 70%)` }}
        />
      )}

      <main className="relative mx-auto flex w-full max-w-[1320px] flex-col gap-8 px-5 pb-10 pt-5 md:gap-10 md:px-12 md:pb-12 md:pt-10">
        <h1 className="sr-only">Overview</h1>
        <DateLine className="text-base text-zinc-300 md:text-lg" />

        {banner}

        {/* Now: the clock and the one-line answer to "how is the air?" */}
        <section aria-label="Now" className="flex flex-wrap items-end justify-between gap-x-16 gap-y-8">
          <Clock size="hero" />
          <div className="flex min-w-0 flex-col gap-2.5 pb-1">
            <div className="flex items-baseline gap-4">
              <span className={`text-[64px] font-bold leading-[0.9] tracking-[-0.04em] tabular-nums md:text-[96px] ${stale ? 'text-zinc-500' : aqiStyle.textClass}`}>
                {aqi.value}
              </span>
              <span className="text-base text-zinc-400 md:text-lg" title="US EPA AQI from indoor PM2.5">AQI</span>
            </div>
            <p className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-zinc-50 md:text-[40px]">
              {stale ? 'Last known reading' : `Air is ${aqi.category.toLowerCase()}`}
            </p>
            <p className="max-w-[34ch] text-base text-zinc-400 md:text-lg">
              {stale ? 'Values are greyed out until the sensor reports again.' : [outside, attention].filter(Boolean).join(' ')}
            </p>
          </div>
        </section>

        <MetricStrip items={readings} stale={stale} />

        {/* Lights */}
        <section aria-label="Lights" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <SectionTitle>Lights</SectionTitle>
            <Link href="/lights" className="inline-flex min-h-8 items-center text-sm text-zinc-400 transition-colors hover:text-white">All lights</Link>
          </div>

          {hue.connection === 'reconnecting' && hue.loaded && (
            <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
              {hue.error ? `${hue.error}. ` : ''}Reconnecting. Values may be out of date.
            </p>
          )}

          {hue.notConfigured ? (
            <div className={`${cardCls} flex flex-wrap items-center justify-between gap-3 px-5 py-5`}>
              <span className="text-sm text-zinc-300">No Hue bridge connected yet.</span>
              <Link href="/settings" className="text-sm font-medium text-amber-300 transition-colors hover:text-amber-200">Set up in Settings</Link>
            </div>
          ) : !hue.loaded ? (
            hue.error ? (
              <div className={`${cardCls} px-5 py-5`} role="alert">
                <p className="text-sm text-red-400">{hue.error}</p>
                <p className="mt-1 text-sm text-zinc-400">Retrying automatically.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4" aria-busy="true" aria-label="Loading lights">
                {[0, 1, 2, 3].map(i => <div key={i} className="h-[76px] animate-pulse rounded-[26px] border border-white/10 bg-air-card md:h-[88px]" />)}
              </div>
            )
          ) : groups.length === 0 ? (
            <div className={`${cardCls} px-5 py-5 text-sm text-zinc-300`}>No rooms found on the bridge.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
              {groups.map(group => (
                <RoomTile key={group.id} group={group} onToggle={onGroupToggle} onOpen={onGroupSelect} />
              ))}
            </div>
          )}
        </section>

        {series.ts.length > 1 && (
          <Chart
            label="CO₂"
            unit="ppm"
            values={series.co2}
            timestamps={series.ts}
            status={co2Status(measures.rco2)}
            statusFn={co2Status}
            muted={stale}
          />
        )}

        <RecentEvents events={recentEvents} />
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
