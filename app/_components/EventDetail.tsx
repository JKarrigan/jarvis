'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { AirQualityEvent, Severity } from '@/lib/eventTypes'
import type { HistoryEntry, DeviceMeasures } from '@/lib/types'
import { Chart } from './Chart'
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

function extract(history: HistoryEntry[], key: keyof DeviceMeasures): number[] {
  return history.map(h => h.measures[key] as number)
}

interface EventDetailData {
  event: AirQualityEvent
  readings: HistoryEntry[]
}

export function EventDetail({ id }: { id: string }) {
  const [data, setData] = useState<EventDetailData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/events/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject('not found'))
      .then((raw: { event: AirQualityEvent; readings: HistoryEntry[] }) => {
        setData({
          event: {
            ...raw.event,
            startTime: new Date(raw.event.startTime),
            endTime: raw.event.endTime ? new Date(raw.event.endTime) : null,
          },
          readings: raw.readings,
        })
      })
      .catch(() => setError('Event not found.'))
  }, [id])

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
  const timestamps = readings.map(r => r.timestamp)
  const lastReading = readings[readings.length - 1]?.measures

  // Determine the latest value for each metric's status fn
  const pm02 = lastReading?.pm02 ?? 0
  const temp = lastReading?.atmpCompensated ?? lastReading?.atmp ?? 20
  const hum = lastReading?.rhumCompensated ?? lastReading?.rhum ?? 50

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
                  <><span className="text-zinc-700">→</span><span>{fmtDateTime(event.endTime)}</span></>
                )}
                <span className="text-zinc-700">·</span>
                <span>{fmtDuration(event.durationMinutes)}</span>
                <span className="text-zinc-700">·</span>
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
              <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider">Peak</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                <span className="text-zinc-400">NOx <span className="text-zinc-200">{event.peak.noxIndex}</span></span>
                <span className="text-zinc-400">VOC <span className="text-zinc-200">{event.peak.tvocIndex}</span></span>
                <span className="text-zinc-400">PM2.5 <span className="text-zinc-200">{event.peak.pm02.toFixed(1)}</span></span>
                <span className="text-zinc-400">CO₂ <span className="text-zinc-200">{event.peak.rco2}</span></span>
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 space-y-1.5">
              <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider">Baseline (pre-event)</p>
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
              <span className="ml-2 font-normal normal-case tracking-normal text-zinc-700">
                ± 15 min context
              </span>
            </h2>
            <Chart label="CO₂" unit="ppm" values={extract(readings, 'rco2')} timestamps={timestamps} status={co2Status(lastReading?.rco2 ?? 0)} statusFn={co2Status} events={[event]} />
            <Chart label="PM2.5" unit="μg/m³" values={extract(readings, 'pm02')} timestamps={timestamps} status={pm25Status(pm02)} statusFn={pm25Status} events={[event]} />
            <Chart label="TVOC" unit="idx" values={extract(readings, 'tvocIndex')} timestamps={timestamps} status={tvocStatus(lastReading?.tvocIndex ?? 0)} statusFn={tvocStatus} events={[event]} />
            <Chart label="NOx" unit="idx" values={extract(readings, 'noxIndex')} timestamps={timestamps} status={noxStatus(lastReading?.noxIndex ?? 0)} statusFn={noxStatus} events={[event]} />
            <Chart label="PM1" unit="μg/m³" values={extract(readings, 'pm01')} timestamps={timestamps} status={pm1Status(lastReading?.pm01 ?? 0)} statusFn={pm1Status} events={[event]} />
            <Chart label="PM10" unit="μg/m³" values={extract(readings, 'pm10')} timestamps={timestamps} status={pm10Status(lastReading?.pm10 ?? 0)} statusFn={pm10Status} events={[event]} />
            <Chart label="Temperature" unit="°C" values={extract(readings, 'atmp')} timestamps={timestamps} status={tempStatus(temp)} statusFn={tempStatus} />
            <Chart label="Humidity" unit="%" values={extract(readings, 'rhum')} timestamps={timestamps} status={humidityStatus(hum)} statusFn={humidityStatus} />
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
