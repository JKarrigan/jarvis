'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AirQualityEvent, Severity } from '@/lib/eventTypes'
import type { HistoryEntry } from '@/lib/types'
import { findPmBatch } from '@/lib/pmCalibration'
import { Chart } from './Chart'
import { buildSeries } from './Dashboard'
import { reviveEvent, usePolling } from './PollingProvider'
import { EmptyState, Page, PageHeader, PageState, SectionTitle, Spinner } from './air/ui'
import {
  co2Status, pm25Status, pm1Status, pm10Status,
  tempStatus, humidityStatus, tvocStatus, noxStatus,
} from '@/lib/thresholds'

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  notable: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  info: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

const SEVERITY_BORDER: Record<Severity, string> = {
  critical: 'border-red-500/20',
  warning: 'border-amber-500/20',
  notable: 'border-blue-500/20',
  info: 'border-air-line',
}

function fmtDateTime(d: Date) {
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(min: number) {
  if (min < 60) return `${Math.round(min)} min`
  return `${(min / 60).toFixed(1)} hr`
}

interface EventDetailData {
  event: AirQualityEvent
  readings: HistoryEntry[]
}

export function EventDetail({ id }: { id: string }) {
  const { tempUnit, pmBatchId } = usePolling()
  const [data, setData] = useState<EventDetailData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch(`/api/events/${encodeURIComponent(id)}`, { signal: ac.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('not found')))
      .then((raw: { event: Parameters<typeof reviveEvent>[0]; readings: HistoryEntry[] }) => {
        setData({ event: reviveEvent(raw.event), readings: raw.readings })
      })
      .catch(() => { if (!ac.signal.aborted) setError('Event not found.') })
    return () => ac.abort()
  }, [id])

  const pmBatch = findPmBatch(pmBatchId)
  const series = useMemo(() => buildSeries(data?.readings ?? [], pmBatch, tempUnit), [data, pmBatch, tempUnit])
  const events = useMemo(() => (data ? [data.event] : []), [data])
  const tempFn = useMemo(
    () => (tempUnit === 'F' ? (v: number) => tempStatus((v - 32) * 5 / 9) : tempStatus),
    [tempUnit],
  )

  if (error) {
    return (
      <PageState><p className="text-sm text-zinc-300">{error}</p></PageState>
    )
  }

  if (!data) {
    return (
      <PageState><Spinner /></PageState>
    )
  }

  const { event, readings } = data
  const lastReading = readings[readings.length - 1]?.measures
  const last = (arr: number[]) => arr[arr.length - 1] ?? NaN

  // Latest value of each series (same compensated/calibrated values as the charts)
  const pm02 = last(series.pm25)
  const temp = lastReading?.atmpCompensated ?? lastReading?.atmp ?? 20
  const hum = last(series.hum)

  const isOngoing = !event.endTime

  return (
    <Page>
      <PageHeader
        title={event.title}
        back={{ href: '/events', label: 'All events' }}
        subtitle={(
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${SEVERITY_STYLES[event.severity]}`}>{event.severity}</span>
            <span>{fmtDateTime(event.startTime)}{event.endTime ? ` to ${fmtDateTime(event.endTime)}` : ''}</span>
            <span aria-hidden="true">·</span>
            <span>{fmtDuration(event.durationMinutes)}</span>
            <span aria-hidden="true">·</span>
            <span>{Math.round(event.confidence * 100)}% confidence</span>
            {isOngoing && <span className="text-emerald-400">ongoing</span>}
          </span>
        )}
      />

        <div className={`space-y-4 rounded-2xl border bg-air-card px-5 py-5 md:px-6 ${SEVERITY_BORDER[event.severity]}`}>
          <p className="max-w-[90ch] text-[15px] leading-relaxed text-zinc-200">{event.description}</p>
          {event.recommendation && (
            <p className="max-w-[90ch] text-sm text-zinc-400">{event.recommendation}</p>
          )}

          {/* Peak vs baseline */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-air-line bg-air-raised px-4 py-3">
              <p className="text-sm font-semibold text-zinc-200">Peak</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
                <span className="text-zinc-400">NOx <span className="text-zinc-200">{event.peak.noxIndex}</span></span>
                <span className="text-zinc-400">VOC <span className="text-zinc-200">{event.peak.tvocIndex}</span></span>
                <span className="text-zinc-400">PM2.5 <span className="text-zinc-200">{event.peak.pm02.toFixed(1)}</span></span>
                <span className="text-zinc-400">CO₂ <span className="text-zinc-200">{event.peak.rco2}</span></span>
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-air-line bg-air-raised px-4 py-3">
              <p className="text-sm font-semibold text-zinc-200">Baseline (pre-event)</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
                <span className="text-zinc-400">NOx <span className="text-zinc-300">{event.baseline.noxIndex}</span></span>
                <span className="text-zinc-400">VOC <span className="text-zinc-300">{event.baseline.tvocIndex}</span></span>
                <span className="text-zinc-400">PM2.5 <span className="text-zinc-300">{event.baseline.pm02.toFixed(1)}</span></span>
                <span className="text-zinc-400">CO₂ <span className="text-zinc-300">{event.baseline.rco2}</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        {readings.length > 1 ? (
          <section className="mt-2 flex flex-col gap-4">
            <SectionTitle className="text-lg">
              Readings during the event
              <span className="ml-2 text-sm font-normal text-zinc-400">with 15 minutes either side</span>
            </SectionTitle>
            <Chart label="CO₂" unit="ppm" values={series.co2} timestamps={series.ts} status={co2Status(lastReading?.rco2 ?? 0)} statusFn={co2Status} events={events} />
            <Chart label="PM2.5" unit="μg/m³" values={series.pm25} timestamps={series.ts} status={pm25Status(pm02)} statusFn={pm25Status} events={events} />
            <Chart label="TVOC" unit="idx" values={series.tvoc} timestamps={series.ts} status={tvocStatus(lastReading?.tvocIndex ?? 0)} statusFn={tvocStatus} events={events} />
            <Chart label="NOx" unit="idx" values={series.nox} timestamps={series.ts} status={noxStatus(lastReading?.noxIndex ?? 0)} statusFn={noxStatus} events={events} />
            <Chart label="PM1" unit="μg/m³" values={series.pm1} timestamps={series.ts} status={pm1Status(lastReading?.pm01 ?? 0)} statusFn={pm1Status} events={events} />
            <Chart label="PM10" unit="μg/m³" values={series.pm10} timestamps={series.ts} status={pm10Status(lastReading?.pm10 ?? 0)} statusFn={pm10Status} events={events} />
            <Chart label="Temperature" unit={`°${tempUnit}`} values={series.temp} timestamps={series.ts} status={tempStatus(temp)} statusFn={tempFn} />
            <Chart label="Humidity" unit="%" values={series.hum} timestamps={series.ts} status={humidityStatus(hum)} statusFn={humidityStatus} />
          </section>
        ) : (
          <EmptyState title="No sensor readings found for this event window" />
        )}
    </Page>
  )
}
