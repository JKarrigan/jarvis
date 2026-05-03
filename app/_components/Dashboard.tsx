'use client'

import { useEffect, useState } from 'react'
import type { DeviceMeasures, HistoryEntry, DailySummary } from '@/lib/types'
import { computeAqi, aqiToColor } from '@/lib/aqi'
import type { StatusColor } from '@/lib/types'
import {
  co2Status, pm25Status, pm1Status, pm10Status,
  tempStatus, humidityStatus, tvocStatus, noxStatus,
} from '@/lib/thresholds'
import { PM_BATCHES, calibratePm25 } from '@/lib/pmCalibration'
import { AqiHeatMap } from './AqiHeatMap'
import { Chart } from './Chart'
import { MetricCard } from './MetricCard'

interface DashboardProps {
  measures: DeviceMeasures
  history: HistoryEntry[]
  lastUpdated: Date
  error: string | null
  tempUnit: 'C' | 'F'
  onTempToggle: () => void
  pmBatchId: string | null
  outdoorAqi: number | null
  dailySummaries: DailySummary[]
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

function secondsAgo(date: Date): string {
  const s = Math.round((Date.now() - date.getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

function formatTemp(celsius: number, unit: 'C' | 'F'): string {
  if (unit === 'F') return (celsius * 9 / 5 + 32).toFixed(1)
  return celsius.toFixed(1)
}

function extract(history: HistoryEntry[], key: keyof DeviceMeasures): number[] {
  return history.map(h => h.measures[key] as number)
}

export function Dashboard({ measures, history, lastUpdated, error, tempUnit, onTempToggle, pmBatchId, outdoorAqi, dailySummaries }: DashboardProps) {
  const pmBatch = PM_BATCHES.find(b => b.id === pmBatchId) ?? null

  // If a calibration batch is selected, derive PM2.5 from the raw particle count,
  // then scale PM1 and PM10 by the same correction ratio.
  const pm02 = (pmBatch && Number.isFinite(measures.pm003Count))
    ? calibratePm25(measures.pm003Count, pmBatch)
    : measures.pm02

  const aqi = computeAqi(pm02)
  // Prefer compensated sensor values when the firmware provides them
  const temp = measures.atmpCompensated ?? measures.atmp
  const hum = measures.rhumCompensated ?? measures.rhum

  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const hhmm = now?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) ?? '--:--'
  const ss   = now ? String(now.getSeconds()).padStart(2, '0') : '--'
  const dow  = now?.toLocaleDateString([], { weekday: 'long' }) ?? ''
  const mmdd = now?.toLocaleDateString([], { month: 'long', day: 'numeric' }) ?? ''

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center justify-end px-6 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          {error && (
            <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-md">
              Live data unavailable
            </span>
          )}
          <span className="text-xs text-zinc-600">Updated {secondsAgo(lastUpdated)}</span>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6 max-w-5xl mx-auto w-full">
        {/* Clock · AQI · Heatmap */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Clock + Date */}
          <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/40 px-5 py-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tabular-nums leading-none text-zinc-100">{hhmm}</span>
              <span className="text-2xl font-bold tabular-nums leading-none text-zinc-600">{ss}</span>
            </div>
            <p className="mt-2 text-sm font-medium text-zinc-300">{dow}</p>
            <p className="text-xs text-zinc-500">{mmdd}</p>
          </div>
          <section className="flex-1 flex flex-col items-center justify-center gap-2 px-5 py-4 rounded-2xl border border-zinc-800 bg-zinc-900/40">
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
          </section>
          {dailySummaries.length > 0 && (
            <section className="w-1/4 shrink-0 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
<AqiHeatMap summaries={dailySummaries} />
            </section>
          )}
        </div>

        {/* Metric Grid */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <MetricCard
            label="CO₂"
            value={measures.rco2}
            unit="ppm"
            status={co2Status(measures.rco2)}
            history={extract(history, 'rco2')}
          />
          <MetricCard
            label="PM2.5"
            value={pm02.toFixed(1)}
            unit="μg/m³"
            status={pm25Status(pm02)}
            history={pmBatch
              ? history.map(h => Number.isFinite(h.measures.pm003Count) ? calibratePm25(h.measures.pm003Count, pmBatch) : h.measures.pm02)
              : extract(history, 'pm02')}
          />
          <MetricCard
            label="PM1"
            value={measures.pm01.toFixed(1)}
            unit="μg/m³"
            status={pm1Status(measures.pm01)}
            history={extract(history, 'pm01')}
          />
          <MetricCard
            label="PM10"
            value={measures.pm10.toFixed(1)}
            unit="μg/m³"
            status={pm10Status(measures.pm10)}
            history={extract(history, 'pm10')}
          />
          <MetricCard
            label="Temperature"
            value={formatTemp(temp, tempUnit)}
            unit={`°${tempUnit}`}
            status={tempStatus(temp)}
            history={extract(history, measures.atmpCompensated != null ? 'atmpCompensated' : 'atmp').map(v =>
              tempUnit === 'F' ? v * 9 / 5 + 32 : v
            )}
          />
          <MetricCard
            label="Humidity"
            value={hum.toFixed(0)}
            unit="%"
            status={humidityStatus(hum)}
            history={extract(history, measures.rhumCompensated != null ? 'rhumCompensated' : 'rhum')}
          />
          <MetricCard
            label="TVOC"
            value={measures.tvocIndex}
            unit="idx"
            status={tvocStatus(measures.tvocIndex)}
            history={extract(history, 'tvocIndex')}
          />
          <MetricCard
            label="NOx"
            value={measures.noxIndex}
            unit="idx"
            status={noxStatus(measures.noxIndex)}
            history={extract(history, 'noxIndex')}
          />
        </section>
        {/* History Charts */}
        {history.length > 1 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 px-1">History</h2>
            <Chart label="CO₂" unit="ppm" values={extract(history, 'rco2')} timestamps={history.map(h => h.timestamp)} status={co2Status(measures.rco2)} statusFn={co2Status} />
            <Chart
              label="PM2.5"
              unit="μg/m³"
              values={pmBatch
                ? history.map(h => Number.isFinite(h.measures.pm003Count) ? calibratePm25(h.measures.pm003Count, pmBatch) : h.measures.pm02)
                : extract(history, 'pm02')}
              timestamps={history.map(h => h.timestamp)}
              status={pm25Status(pm02)}
              statusFn={pm25Status}
            />
            <Chart label="PM1" unit="μg/m³" values={extract(history, 'pm01')} timestamps={history.map(h => h.timestamp)} status={pm1Status(measures.pm01)} statusFn={pm1Status} />
            <Chart label="PM10" unit="μg/m³" values={extract(history, 'pm10')} timestamps={history.map(h => h.timestamp)} status={pm10Status(measures.pm10)} statusFn={pm10Status} />
            <Chart
              label="Temperature"
              unit={`°${tempUnit}`}
              values={extract(history, measures.atmpCompensated != null ? 'atmpCompensated' : 'atmp').map(v => tempUnit === 'F' ? v * 9 / 5 + 32 : v)}
              timestamps={history.map(h => h.timestamp)}
              status={tempStatus(temp)}
              statusFn={v => tempStatus(tempUnit === 'F' ? (v - 32) * 5 / 9 : v)}
            />
            <Chart label="Humidity" unit="%" values={extract(history, measures.rhumCompensated != null ? 'rhumCompensated' : 'rhum')} timestamps={history.map(h => h.timestamp)} status={humidityStatus(hum)} statusFn={humidityStatus} />
            <Chart label="TVOC" unit="idx" values={extract(history, 'tvocIndex')} timestamps={history.map(h => h.timestamp)} status={tvocStatus(measures.tvocIndex)} statusFn={tvocStatus} />
            <Chart label="NOx" unit="idx" values={extract(history, 'noxIndex')} timestamps={history.map(h => h.timestamp)} status={noxStatus(measures.noxIndex)} statusFn={noxStatus} />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="flex items-center justify-between px-6 py-3 border-t border-zinc-800 text-xs text-zinc-600">
        <div className="flex items-center gap-3">
          <span>Refreshes every 10s</span>
          {measures.model && <span className="text-zinc-700">{measures.model}</span>}
          {measures.firmware && <span className="text-zinc-700">fw {measures.firmware}</span>}
        </div>
        <button
          onClick={onTempToggle}
          className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors font-mono text-xs"
        >
          °C / °F
        </button>
      </footer>
    </div>
  )
}
