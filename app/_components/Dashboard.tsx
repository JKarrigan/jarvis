'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { DeviceMeasures, HistoryEntry, DailySummary } from '@/lib/types'
import type { AirQualityEvent } from '@/lib/eventTypes'
import {
  co2Status, pm25Status, pm1Status, pm10Status,
  tempStatus, humidityStatus, tvocStatus, noxStatus,
} from '@/lib/thresholds'
import { effectivePm25, findPmBatch, type PmBatch } from '@/lib/pmCalibration'
import { AqiHeatMap } from './AqiHeatMap'
import { Chart } from './Chart'
import { Clock, DateLine } from './Clock'
import { MetricCard, metricReading, type MetricReading } from './MetricCard'
import { AqiSummary } from './AqiSummary'
import { Card, EmptyState, Page, PageHeader, SectionTitle, Segmented, Spinner, btnCls } from './air/ui'
import { EventBanner } from './events/EventBanner'
import { EventRow } from './events/EventBits'
import { reviveEvent } from './PollingProvider'
import { useNowMinute } from '@/lib/useNow'

type RangeKey = '1h' | '6h' | '24h' | '7d' | '30d'

const TEMP_UNITS = [{ key: 'C', label: '°C' }, { key: 'F', label: '°F' }] as const

const RANGES: { key: RangeKey; label: string; ms: number }[] = [
  { key: '1h',  label: '1h',  ms: 60 * 60 * 1000 },
  { key: '6h',  label: '6h',  ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d',  label: '7d',  ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
]

/** Rows in "Events in this view"; the rest are one tap away in the log. */
const EVENTS_SHOWN = 5

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
  onTempUnit: (unit: 'C' | 'F') => void
  pmBatchId: string | null
  outdoorAqi: number | null
  dailySummaries: DailySummary[]
  /** Latest reading is old or the device is failing: grey the values. */
  stale: boolean
  banner?: React.ReactNode
  devControls?: DevControls
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

const tempStatusFn = { C: tempStatus, F: (v: number) => tempStatus((v - 32) * 5 / 9) } as const

export function Dashboard({ measures, history, tempUnit, onTempUnit, pmBatchId, outdoorAqi, dailySummaries, stale, banner, devControls }: DashboardProps) {
  const nowMinute = useNowMinute()
  // Memoized so the compiler treats the batch as immutable for the series memos below.
  const pmBatch = useMemo(() => findPmBatch(pmBatchId), [pmBatchId])
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

  const chartEvents = useMemo(() => {
    const ts = series.ts
    const tMin = ts[0] ?? 0
    const tMax = ts[ts.length - 1] ?? 0
    return (chartEventsAll ?? []).filter(e => {
      const start = e.startTime.getTime()
      const end = e.endTime?.getTime() ?? tMax
      return end >= tMin && start <= tMax
    })
  }, [chartEventsAll, series])

  const tempFn = tempStatusFn[tempUnit]

  const readings: MetricReading[] = [
    metricReading('co2', 'CO₂', measures.rco2, 'ppm', co2Status(measures.rco2), cards.co2),
    metricReading('pm25', 'PM2.5', fmtNum(pm02, 1), 'µg/m³', pm25Status(pm02), cards.pm25),
    metricReading('pm1', 'PM1', fmtNum(measures.pm01, 1), 'µg/m³', pm1Status(measures.pm01), cards.pm1),
    metricReading('pm10', 'PM10', fmtNum(measures.pm10, 1), 'µg/m³', pm10Status(measures.pm10), cards.pm10),
    metricReading('temperature', 'Temperature', fmtNum(toUnit(temp, tempUnit), 1), `°${tempUnit}`, tempStatus(temp), cards.temp),
    metricReading('humidity', 'Humidity', fmtNum(hum, 0), '%', humidityStatus(hum), cards.hum),
    metricReading('tvoc', 'TVOC', measures.tvocIndex, 'index', tvocStatus(measures.tvocIndex), cards.tvoc),
    metricReading('nox', 'NOx', measures.noxIndex, 'index', noxStatus(measures.noxIndex), cards.nox),
  ]

  const deviceInfo = [
    'Refreshes every 10 s',
    measures.model,
    measures.firmware ? `firmware ${measures.firmware}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <Page>
      <PageHeader title="Air quality" subtitle={<DateLine />}>
        {devControls && (
          <>
            <button type="button" onClick={devControls.onSimulate} className={btnCls}>Simulate alerts</button>
            {devControls.hasDevEvents && (
              <button type="button" onClick={devControls.onClear} className={btnCls}>Clear</button>
            )}
          </>
        )}
        <Segmented options={TEMP_UNITS} value={tempUnit} onChange={onTempUnit} label="Temperature unit" />
        <div className="hidden pl-2 sm:block"><Clock /></div>
      </PageHeader>

      {banner}
      <EventBanner />

      {/* AQI · 30-day heat map */}
      <div className="flex flex-col gap-4 lg:flex-row">
        <AqiSummary pm25={pm02} outdoorAqi={outdoorAqi} stale={stale} className="min-w-0 flex-1" />
        {dailySummaries.length > 0 && (
          <Card aria-label="Daily air quality" className="w-full max-w-[380px] shrink-0 p-5 lg:w-[280px]">
            <p className="mb-3 text-sm text-zinc-400">Daily average AQI</p>
            <AqiHeatMap summaries={dailySummaries} />
          </Card>
        )}
      </div>

      <section aria-label="Readings" className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {readings.map(r => <MetricCard key={r.slug} {...r} stale={stale} />)}
      </section>

      {/* History */}
      <section className="mt-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SectionTitle className="text-lg">History</SectionTitle>
          <Segmented options={RANGES} value={range} onChange={setRange} label="History range" />
          {loadingChart && <Spinner className="h-4 w-4" />}
        </div>

        {chartEvents.length > 0 && (
          <Card aria-label="Events in this view" className="overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 pb-2 pt-4 md:px-5">
              <p className="text-sm text-zinc-400">
                <span className="font-medium text-zinc-200">Events in this view.</span> The shaded bands on the charts mark them.
              </p>
              {chartEvents.length > EVENTS_SHOWN && (
                <Link href="/events" className="inline-flex min-h-8 items-center text-sm text-zinc-400 transition-colors hover:text-white">
                  All {chartEvents.length}
                </Link>
              )}
            </div>
            {chartEvents.slice(0, EVENTS_SHOWN).map(e => (
              <EventRow key={e.id} event={e} now={nowMinute} showDay className="border-t border-air-line" />
            ))}
          </Card>
        )}

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
          <EmptyState title="No data for this period" />
        )}
      </section>

      <p className="pt-2 text-sm text-zinc-400">{deviceInfo}</p>
    </Page>
  )
}
