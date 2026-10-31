'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { DeviceMeasures, HistoryEntry, DailySummary } from '@/lib/types'
import type { AirQualityEvent } from '@/lib/eventTypes'
import { computeAqi, aqiToColor } from '@/lib/aqi'
import {
  co2Status, pm25Status, pm1Status, pm10Status,
  tempStatus, humidityStatus, tvocStatus, noxStatus,
} from '@/lib/thresholds'
import { effectivePm25, findPmBatch, type PmBatch } from '@/lib/pmCalibration'
import { metricStatusLabel } from '@/lib/metrics'
import { STATUS_COLORS } from '@/lib/statusColors'
import { AqiHeatMap } from './AqiHeatMap'
import { Chart } from './Chart'
import { Clock, DateLabel } from './Clock'
import { MetricCard } from './MetricCard'
import { EventBanner } from './EventBanner'
import { reviveEvent } from './PollingProvider'

type RangeKey = '1h' | '6h' | '24h' | '7d' | '30d'

const RANGES: { key: RangeKey; label: string; ms: number }[] = [
  { key: '1h',  label: '1h',  ms: 60 * 60 * 1000 },
  { key: '6h',  label: '6h',  ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d',  label: '7d',  ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
]

/** Charts refetch their range this often so they keep moving on a kiosk. */
const CHART_REFRESH_MS = 60_000

interface DevControls {
  onSimulate: () => void
  onClear: () => void
  hasDevEvents: boolean
}

interface DashboardProps {
  measures: DeviceMeasures
  history: HistoryEntry[]
  tempUnit: 'C' | 'F'
  onTempToggle: () => void
  pmBatchId: string | null
  outdoorAqi: number | null
  dailySummaries: DailySummary[]
  activeEvents: AirQualityEvent[]
  onAcknowledgeEvent: (id: string) => void
  /** Latest reading is old or the device is failing: grey the values. */
  stale: boolean
  banner?: React.ReactNode
  devControls?: DevControls
}

const EVENT_COLOR: Record<string, string> = {
  critical: '#dc2626',
  warning: '#f59e0b',
  notable: '#3b82f6',
  info: '#9ca3af',
}

export function toUnit(celsius: number, unit: 'C' | 'F'): number {
  return unit === 'F' ? celsius * 9 / 5 + 32 : celsius
}

function fmtNum(v: number | undefined, digits: number): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—'
}

function num(v: number | undefined): number {
  return typeof v === 'number' ? v : NaN
}

/** One numeric array per metric, built once per history change (compensated values per row). */
export function buildSeries(rows: HistoryEntry[], pmBatch: PmBatch | null, tempUnit: 'C' | 'F') {
  const n = rows.length
  const s = {
    ts: new Array<number>(n), co2: new Array<number>(n), pm25: new Array<number>(n), pm1: new Array<number>(n),
    pm10: new Array<number>(n), temp: new Array<number>(n), hum: new Array<number>(n), tvoc: new Array<number>(n), nox: new Array<number>(n),
  }
  for (let i = 0; i < n; i++) {
    const m = rows[i].measures
    s.ts[i] = rows[i].timestamp
    s.co2[i] = num(m.rco2)
    s.pm25[i] = effectivePm25(m, pmBatch)
    s.pm1[i] = num(m.pm01)
    s.pm10[i] = num(m.pm10)
    s.temp[i] = toUnit(num(m.atmpCompensated ?? m.atmp), tempUnit)
    s.hum[i] = num(m.rhumCompensated ?? m.rhum)
    s.tvoc[i] = num(m.tvocIndex)
    s.nox[i] = num(m.noxIndex)
  }
  return s
}

/** AQI hero: indoor PM2.5 AQI, category chip and the outdoor comparison. */
export const AqiPanel = memo(function AqiPanel({ pm25, outdoorAqi, stale, className }: {
  pm25: number
  outdoorAqi: number | null
  stale: boolean
  className: string
}) {
  const aqi = computeAqi(pm25)
  const style = STATUS_COLORS[aqi.color]
  return (
    <section className={className}>
      <div className="flex items-center gap-3">
        <span className={`text-4xl font-bold tabular-nums leading-none ${stale ? 'text-zinc-500' : style.textClass}`}>
          {aqi.value}
        </span>
        <div className="flex flex-col gap-1">
          <span className={`self-start px-2 py-0.5 rounded-full text-xs font-semibold border ${stale ? 'border-zinc-700 text-zinc-400' : style.badgeClass}`}>
            {aqi.category}
          </span>
          <span className="text-xs text-zinc-500">PM2.5 · US EPA</span>
        </div>
      </div>
      {outdoorAqi !== null && (
        <div className="flex items-center gap-2 text-xs" title="Outdoor PM2.5 AQI from Open-Meteo (CAMS model), not a local sensor">
          <span className="text-zinc-500">Outdoor</span>
          <span className="font-mono font-semibold" style={{ color: STATUS_COLORS[aqiToColor(outdoorAqi)].hex }}>
            {outdoorAqi}
          </span>
          <span className="text-zinc-600" aria-hidden="true">·</span>
          <span className="text-zinc-500">
            {aqi.value - outdoorAqi > 0 ? '+' : ''}{aqi.value - outdoorAqi} vs outdoor
          </span>
        </div>
      )}
    </section>
  )
})

const tempStatusFn = { C: tempStatus, F: (v: number) => tempStatus((v - 32) * 5 / 9) } as const

export function Dashboard({ measures, history, tempUnit, onTempToggle, pmBatchId, outdoorAqi, dailySummaries, activeEvents, onAcknowledgeEvent, stale, banner, devControls }: DashboardProps) {
  const pmBatch = findPmBatch(pmBatchId)
  const pm02 = effectivePm25(measures, pmBatch)
  // Prefer compensated sensor values when the firmware provides them
  const temp = measures.atmpCompensated ?? measures.atmp
  const hum = measures.rhumCompensated ?? measures.rhum

  const [range, setRange] = useState<RangeKey>('24h')
  const [chart, setChart] = useState<{ key: RangeKey; rows: HistoryEntry[]; events: AirQualityEvent[] } | null>(null)
  const loadingChart = chart?.key !== range

  useEffect(() => {
    const ac = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const rangeMs = RANGES.find(r => r.key === range)!.ms
      const to = Date.now()
      const from = to - rangeMs
      try {
        const [rows, events] = await Promise.all([
          fetch(`/api/history?from=${from}&to=${to}`, { signal: ac.signal }).then(r => r.ok ? r.json() : []),
          fetch(`/api/events?since=${from}&limit=500`, { signal: ac.signal }).then(r => r.ok ? r.json() : []),
        ])
        setChart({
          key: range,
          rows: Array.isArray(rows) ? rows : [],
          events: Array.isArray(events) ? events.map(reviveEvent) : [],
        })
      } catch { /* aborted or offline: keep what we have */ }
      if (!ac.signal.aborted) timer = setTimeout(load, CHART_REFRESH_MS)
    }
    void load()
    return () => {
      ac.abort()
      clearTimeout(timer)
    }
  }, [range])

  const cards = useMemo(() => buildSeries(history, pmBatch, tempUnit), [history, pmBatch, tempUnit])
  const series = useMemo(() => buildSeries(chart?.rows ?? [], pmBatch, tempUnit), [chart, pmBatch, tempUnit])
  const chartEventsAll = chart?.events
  const criticalEvents = useMemo(() => activeEvents.filter(e => e.severity === 'critical' && !e.acknowledged), [activeEvents])

  const chartEvents = useMemo(() => {
    const ts = series.ts
    const tMin = ts[0] ?? 0
    const tMax = ts[ts.length - 1] ?? 0
    return (chartEventsAll ?? []).filter(e => {
      if (e.confidence < 0.5) return false
      const start = e.startTime.getTime()
      const end = e.endTime?.getTime() ?? tMax
      return end >= tMin && start <= tMax
    })
  }, [chartEventsAll, series])

  const tempFn = tempStatusFn[tempUnit]
  const onRange = useCallback((key: RangeKey) => setRange(key), [])

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <main className="flex-1 p-6 space-y-6 max-w-5xl mx-auto w-full">
        {banner}
        {/* Critical event banner */}
        {criticalEvents.length > 0 && (
          <EventBanner events={criticalEvents} onAcknowledge={onAcknowledgeEvent} />
        )}

        {/* Clock · AQI · Heatmap */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/40 px-5 py-4">
            <Clock />
            <div className="mt-2 text-center">
              <DateLabel weekdayClass="text-sm font-medium text-zinc-300" dateClass="text-xs text-zinc-500" />
            </div>
          </div>
          <AqiPanel
            pm25={pm02}
            outdoorAqi={outdoorAqi}
            stale={stale}
            className="flex-1 flex flex-col items-center justify-center gap-2 px-5 py-4 rounded-2xl border border-zinc-800 bg-zinc-900/40"
          />
          {dailySummaries.length > 0 && (
            <section className="sm:w-1/4 shrink-0 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
              <AqiHeatMap summaries={dailySummaries} />
            </section>
          )}
        </div>

        {/* Metric Grid */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <MetricCard label="CO₂" value={measures.rco2} unit="ppm" status={co2Status(measures.rco2)}
            statusLabel={metricStatusLabel('co2', co2Status(measures.rco2))} history={cards.co2} stale={stale} />
          <MetricCard label="PM2.5" value={fmtNum(pm02, 1)} unit="μg/m³" status={pm25Status(pm02)}
            statusLabel={metricStatusLabel('pm25', pm25Status(pm02))} history={cards.pm25} stale={stale} />
          <MetricCard label="PM1" value={fmtNum(measures.pm01, 1)} unit="μg/m³" status={pm1Status(measures.pm01)}
            statusLabel={metricStatusLabel('pm1', pm1Status(measures.pm01))} history={cards.pm1} stale={stale} />
          <MetricCard label="PM10" value={fmtNum(measures.pm10, 1)} unit="μg/m³" status={pm10Status(measures.pm10)}
            statusLabel={metricStatusLabel('pm10', pm10Status(measures.pm10))} history={cards.pm10} stale={stale} />
          <MetricCard label="Temperature" value={fmtNum(toUnit(temp, tempUnit), 1)} unit={`°${tempUnit}`} status={tempStatus(temp)}
            statusLabel={metricStatusLabel('temperature', tempStatus(temp))} history={cards.temp} stale={stale} />
          <MetricCard label="Humidity" value={fmtNum(hum, 0)} unit="%" status={humidityStatus(hum)}
            statusLabel={metricStatusLabel('humidity', humidityStatus(hum))} history={cards.hum} stale={stale} />
          <MetricCard label="TVOC" value={measures.tvocIndex} unit="idx" status={tvocStatus(measures.tvocIndex)}
            statusLabel={metricStatusLabel('tvoc', tvocStatus(measures.tvocIndex))} history={cards.tvoc} stale={stale} />
          <MetricCard label="NOx" value={measures.noxIndex} unit="idx" status={noxStatus(measures.noxIndex)}
            statusLabel={metricStatusLabel('nox', noxStatus(measures.noxIndex))} history={cards.nox} stale={stale} />
        </section>

        {/* History Charts */}
        <section className="space-y-3">
          <div className="px-1 space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">History</h2>
              <div className="flex items-center gap-1.5" role="group" aria-label="History range">
                {RANGES.map(r => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => onRange(r.key)}
                    aria-pressed={range === r.key}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                      range === r.key
                        ? 'bg-zinc-700 text-zinc-100'
                        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
                {loadingChart && (
                  <div className="w-3.5 h-3.5 rounded-full border border-zinc-700 border-t-zinc-400 animate-spin ml-1" aria-label="Loading" />
                )}
              </div>
            </div>
            {chartEvents.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/60">
                <div className="px-3 py-2 flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Events in this view</span>
                  <span className="text-xs text-zinc-500">· chart overlays highlight these periods</span>
                </div>
                {chartEvents.map(e => {
                  const eColor = EVENT_COLOR[e.severity]
                  const startStr = e.startTime.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  const endStr = e.endTime
                    ? e.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : null
                  const dur = e.durationMinutes < 60
                    ? `${Math.round(e.durationMinutes)} min`
                    : `${(e.durationMinutes / 60).toFixed(1)} hr`
                  return (
                    <div key={e.id} className="px-3 py-2 flex items-center gap-3 flex-wrap">
                      <span
                        className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded border"
                        style={{ color: eColor, borderColor: `${eColor}35`, backgroundColor: `${eColor}12` }}
                      >
                        {e.severity}
                      </span>
                      <span className="text-xs font-medium text-zinc-200">{e.title}</span>
                      <span className="text-xs text-zinc-500">
                        {startStr}{endStr ? ` → ${endStr}` : ''} · {dur}
                      </span>
                      {!e.endTime && (
                        <span className="text-xs text-emerald-500 animate-pulse">ongoing</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {series.ts.length > 1 ? (
            <>
              <Chart label="CO₂" unit="ppm" values={series.co2} timestamps={series.ts} status={co2Status(measures.rco2)} statusFn={co2Status} events={chartEvents} muted={stale} />
              <Chart label="PM2.5" unit="μg/m³" values={series.pm25} timestamps={series.ts} status={pm25Status(pm02)} statusFn={pm25Status} events={chartEvents} muted={stale} />
              <Chart label="PM1" unit="μg/m³" values={series.pm1} timestamps={series.ts} status={pm1Status(measures.pm01)} statusFn={pm1Status} events={chartEvents} muted={stale} />
              <Chart label="PM10" unit="μg/m³" values={series.pm10} timestamps={series.ts} status={pm10Status(measures.pm10)} statusFn={pm10Status} events={chartEvents} muted={stale} />
              <Chart label="Temperature" unit={`°${tempUnit}`} values={series.temp} timestamps={series.ts} status={tempStatus(temp)} statusFn={tempFn} muted={stale} />
              <Chart label="Humidity" unit="%" values={series.hum} timestamps={series.ts} status={humidityStatus(hum)} statusFn={humidityStatus} muted={stale} />
              <Chart label="TVOC" unit="idx" values={series.tvoc} timestamps={series.ts} status={tvocStatus(measures.tvocIndex)} statusFn={tvocStatus} events={chartEvents} muted={stale} />
              <Chart label="NOx" unit="idx" values={series.nox} timestamps={series.ts} status={noxStatus(measures.noxIndex)} statusFn={noxStatus} events={chartEvents} muted={stale} />
            </>
          ) : !loadingChart && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 h-32 flex items-center justify-center">
              <p className="text-sm text-zinc-500">No data for this period</p>
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="flex items-center justify-between px-6 py-3 border-t border-zinc-800 text-xs text-zinc-500">
        <div className="flex items-center gap-3">
          <span>Refreshes every 10s</span>
          {measures.model && <span>{measures.model}</span>}
          {measures.firmware && <span>fw {measures.firmware}</span>}
        </div>
        <div className="flex items-center gap-2">
          {devControls && (
            <>
              <button
                type="button"
                onClick={devControls.onSimulate}
                className="px-2 py-1 rounded-md bg-red-900/40 border border-red-700/40 hover:bg-red-900/60 text-red-400 transition-colors font-mono text-xs"
              >
                Simulate Alerts
              </button>
              {devControls.hasDevEvents && (
                <button
                  type="button"
                  onClick={devControls.onClear}
                  className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors font-mono text-xs"
                >
                  Clear
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={onTempToggle}
            className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors font-mono text-xs"
          >
            °C / °F
          </button>
        </div>
      </footer>
    </div>
  )
}
