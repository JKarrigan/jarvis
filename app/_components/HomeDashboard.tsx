'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { DeviceMeasures, HistoryEntry, HueGroup } from '@/lib/types'
import { computeAqi, aqiToColor } from '@/lib/aqi'
import type { StatusColor } from '@/lib/types'
import {
  co2Status, tempStatus, humidityStatus, tvocStatus,
} from '@/lib/thresholds'
import { PM_BATCHES, calibratePm25 } from '@/lib/pmCalibration'
import { Chart } from './Chart'
import { MetricCard } from './MetricCard'

interface HomeDashboardProps {
  measures: DeviceMeasures
  history: HistoryEntry[]
  lastUpdated: Date
  error: string | null
  tempUnit: 'C' | 'F'
  pmBatchId: string | null
  outdoorAqi: number | null
  groups: HueGroup[]
  onGroupToggle: (id: string, on: boolean) => void
}

const STATUS_HEX: Record<StatusColor, string> = {
  good: '#34d399', moderate: '#facc15', sensitive: '#fb923c',
  unhealthy: '#ef4444', 'very-unhealthy': '#a855f7', hazardous: '#9f1239',
}

const AQI_BG: Record<string, string> = {
  good: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  moderate: 'bg-yellow-400/15 text-yellow-300 border-yellow-400/30',
  sensitive: 'bg-orange-400/15 text-orange-300 border-orange-400/30',
  unhealthy: 'bg-red-500/15 text-red-400 border-red-500/30',
  'very-unhealthy': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  hazardous: 'bg-rose-900/30 text-rose-300 border-rose-900/50',
}

const AQI_VALUE: Record<string, string> = {
  good: 'text-emerald-400',
  moderate: 'text-yellow-400',
  sensitive: 'text-orange-400',
  unhealthy: 'text-red-500',
  'very-unhealthy': 'text-purple-500',
  hazardous: 'text-rose-400',
}

function formatTemp(celsius: number, unit: 'C' | 'F'): string {
  if (unit === 'F') return (celsius * 9 / 5 + 32).toFixed(1)
  return celsius.toFixed(1)
}

function extract(history: HistoryEntry[], key: keyof DeviceMeasures): number[] {
  return history.map(h => h.measures[key] as number)
}

function briPct(bri: number) {
  return Math.round((bri / 254) * 100)
}

function Toggle({ on, disabled, onToggle }: { on: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-40 ${
        on ? 'bg-amber-400' : 'bg-zinc-700'
      }`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
        on ? 'translate-x-4' : 'translate-x-0'
      }`} />
    </button>
  )
}


export function HomeDashboard({
  measures, history, lastUpdated, error, tempUnit, pmBatchId, outdoorAqi, groups, onGroupToggle,
}: HomeDashboardProps) {
  const pmBatch = PM_BATCHES.find(b => b.id === pmBatchId) ?? null

  const pm02 = (pmBatch && Number.isFinite(measures.pm003Count))
    ? calibratePm25(measures.pm003Count, pmBatch)
    : measures.pm02

  const aqi = computeAqi(pm02)
  const temp = measures.atmpCompensated ?? measures.atmp
  const hum = measures.rhumCompensated ?? measures.rhum

  const co2History = extract(history, 'rco2')
  const tempHistory = extract(history, measures.atmpCompensated != null ? 'atmpCompensated' : 'atmp')
    .map(v => tempUnit === 'F' ? v * 9 / 5 + 32 : v)

  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const hhmm   = now?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) ?? '--:--'
  const ss     = now ? String(now.getSeconds()).padStart(2, '0') : '--'
  const dow    = now?.toLocaleDateString([], { weekday: 'long' }) ?? ''
  const mmdd   = now?.toLocaleDateString([], { month: 'long', day: 'numeric' }) ?? ''

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── Left: Air Quality ── */}
          <div className="flex-1 min-w-0 space-y-3">

            {/* Time · Date · AQI */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Time */}
              <div className="flex items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/40 px-5 py-4">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tabular-nums leading-none text-zinc-100">{hhmm}</span>
                  <span className="text-2xl font-bold tabular-nums leading-none text-zinc-600">{ss}</span>
                </div>
              </div>
              {/* Date */}
              <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/40 px-5 py-4">
                <p className="text-xl font-semibold text-zinc-100 leading-tight">{dow}</p>
                <p className="mt-1 text-sm text-zinc-500">{mmdd}</p>
              </div>
              {/* AQI */}
              <div className="flex flex-col justify-center gap-2 px-5 py-4 rounded-2xl border border-zinc-800 bg-zinc-900/40">
                <div className="flex items-center gap-3">
                  <span className={`text-4xl font-bold tabular-nums leading-none ${AQI_VALUE[aqi.color]}`}>
                    {aqi.value}
                  </span>
                  <div className="flex flex-col gap-1">
                    <span className={`self-start px-2 py-0.5 rounded-full text-xs font-semibold border ${AQI_BG[aqi.color]}`}>
                      {aqi.category}
                    </span>
                    <span className="text-xs text-zinc-600">PM2.5 · US EPA</span>
                  </div>
                </div>
                {outdoorAqi !== null && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-600">Outdoor</span>
                    <span className="font-mono font-semibold" style={{ color: STATUS_HEX[aqiToColor(outdoorAqi)] }}>
                      {outdoorAqi}
                    </span>
                    <span className="text-zinc-700">·</span>
                    <span className="text-zinc-600">
                      {aqi.value - outdoorAqi > 0 ? '+' : ''}{aqi.value - outdoorAqi} vs outdoor
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Metric cards — 2×2 on mobile, single row of 4 on md+ */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                label="Temperature"
                value={formatTemp(temp, tempUnit)}
                unit={`°${tempUnit}`}
                status={tempStatus(temp)}
                history={tempHistory}
              />
              <MetricCard
                label="Humidity"
                value={hum.toFixed(0)}
                unit="%"
                status={humidityStatus(hum)}
                history={extract(history, measures.rhumCompensated != null ? 'rhumCompensated' : 'rhum')}
              />
              <MetricCard
                label="CO₂"
                value={measures.rco2}
                unit="ppm"
                status={co2Status(measures.rco2)}
                history={co2History}
              />
              <MetricCard
                label="TVOC"
                value={measures.tvocIndex}
                unit="idx"
                status={tvocStatus(measures.tvocIndex)}
                history={extract(history, 'tvocIndex')}
              />
            </div>

            {/* CO₂ chart */}
            {history.length > 1 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 px-1">CO₂ History</h2>
                <Chart
                  label="CO₂"
                  unit="ppm"
                  values={co2History}
                  timestamps={history.map(h => h.timestamp)}
                  status={co2Status(measures.rco2)}
                  statusFn={co2Status}
                />
              </section>
            )}
          </div>

          {/* ── Right: Lights ── */}
          <div className="w-full lg:w-72 shrink-0 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Lights</h2>
              <Link href="/lights" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                Manage →
              </Link>
            </div>

            {groups.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 flex flex-col items-center gap-2">
                <span className="text-sm text-zinc-600">No lights configured</span>
                <Link href="/settings" className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors">
                  Set up Hue Bridge →
                </Link>
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden divide-y divide-zinc-800">
                {groups.map(group => {
                  const lightsOnCount = group.on ? group.lightIds.length : 0
                  return (
                    <div key={group.id} className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-200 truncate">{group.name}</p>
                        <p className="text-xs text-zinc-600 mt-0.5">
                          {group.on
                            ? `${lightsOnCount} light${lightsOnCount !== 1 ? 's' : ''} · ${briPct(group.brightness)}%`
                            : 'Off'
                          }
                        </p>
                      </div>
                      <Toggle
                        on={group.on}
                        disabled={false}
                        onToggle={() => onGroupToggle(group.id, !group.on)}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
