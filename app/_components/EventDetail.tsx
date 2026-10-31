'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { AirQualityEvent, Severity } from '@/lib/eventTypes'
import type { HistoryEntry } from '@/lib/types'
import { findPmBatch } from '@/lib/pmCalibration'
import { Chart } from './Chart'
import { buildSeries } from './Dashboard'
import { reviveEvent, usePolling } from './PollingProvider'
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
  info: 'border-zinc-800',
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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-sm text-zinc-500">{error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-emerald-500 animate-spin" />
      </div>
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
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back nav */}
        <Link href="/events" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <polyline points="8 2 4 6 8 10" />
          </svg>
          All events
        </Link>

        {/* Event header */}
        <div className={`rounded-xl border bg-zinc-900/40 px-5 py-4 space-y-3 ${SEVERITY_BORDER[event.severity]}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${SEVERITY_STYLES[event.severity]}`}>
                  {event.severity}
                </span>
                <h1 className="text-lg font-semibold text-zinc-100">{event.title}</h1>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-zinc-500">
                <span>{fmtDateTime(event.startTime)}</span>
                {event.endTime && (
                  <><span className="text-zinc-500">→</span><span>{fmtDateTime(event.endTime)}</span></>
                )}
                <span className="text-zinc-500">·</span>
                <span>{fmtDuration(event.durationMinutes)}</span>
                <span className="text-zinc-500">·</span>
                <span>{Math.round(event.confidence * 100)}% confidence</span>
                {isOngoing && <span className="text-emerald-500 animate-pulse">ongoing</span>}
              </div>
            </div>
          </div>

          <p className="text-sm text-zinc-300 leading-relaxed">{event.description}</p>
          {event.recommendation && (
            <p className="text-sm text-zinc-500 italic">{event.recommendation}</p>
          )}

          {/* Peak vs baseline */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 space-y-1.5">
              <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Peak</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                <span className="text-zinc-400">NOx <span className="text-zinc-200">{event.peak.noxIndex}</span></span>
                <span className="text-zinc-400">VOC <span className="text-zinc-200">{event.peak.tvocIndex}</span></span>
                <span className="text-zinc-400">PM2.5 <span className="text-zinc-200">{event.peak.pm02.toFixed(1)}</span></span>
                <span className="text-zinc-400">CO₂ <span className="text-zinc-200">{event.peak.rco2}</span></span>
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 space-y-1.5">
              <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Baseline (pre-event)</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
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
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 px-1">
              Sensor readings during event
              <span className="ml-2 font-normal normal-case tracking-normal text-zinc-500">
                ± 15 min context
              </span>
            </h2>
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
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center">
            <p className="text-sm text-zinc-500">No sensor readings found for this event window.</p>
          </div>
        )}
      </div>
    </div>
  )
}
