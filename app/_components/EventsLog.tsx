'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { AirQualityEvent, Severity, EventType } from '@/lib/eventTypes'
import { EventTimeline, TIMELINE_RANGES } from './EventTimeline'

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

const TYPE_LABEL: Record<EventType, string> = {
  combustion_exhaust: 'Combustion exhaust',
  fuel_vapor: 'Fuel vapor',
  outdoor_drift: 'Outdoor drift',
  voc_event: 'VOC event',
  particulate_spike: 'Particulate spike',
  ventilation_poor: 'Poor ventilation',
}

interface EventTypeMeta {
  label: string
  severity: Severity
  sensors: string
  pattern: string
  causes: string
  action: string
}

const EVENT_LEGEND: EventTypeMeta[] = [
  {
    label: 'Combustion exhaust',
    severity: 'critical',
    sensors: 'NOx + PM2.5 + VOC elevated together',
    pattern: 'NOx ≥ 3× baseline (floor of 4), PM2.5 ≥ 12 μg/m³ (+6 above baseline), VOC +60 above baseline — all sustained ≥ 5 min',
    causes: 'Heater venting failure, generator backdraft, vehicle exhaust infiltration',
    action: 'Check stove/heater venting. Open windows. Verify CO detector.',
  },
  {
    label: 'Fuel vapor',
    severity: 'warning',
    sensors: 'VOC spike, no combustion signature',
    pattern: 'VOC ≥ 250 idx (+150 above baseline), NOx near baseline, PM2.5 < baseline+10. Distinguished from VOC event by VOC magnitude.',
    causes: 'Fuel leak or spill, refilling a kerosene heater, drip tray evaporation',
    action: 'Identify and remove the fuel source. Ventilate immediately.',
  },
  {
    label: 'Outdoor drift',
    severity: 'warning',
    sensors: 'NOx + PM2.5 elevated, CO₂ flat',
    pattern: 'NOx ≥ 3× baseline (floor of 4), PM2.5 ≥ 10 μg/m³ (+5), CO₂ rise < 100 ppm — dilution as outside air enters',
    causes: 'Traffic exhaust, neighbor generator, wildfire smoke blowing in',
    action: 'Close windows. Set HVAC to recirculate.',
  },
  {
    label: 'VOC event',
    severity: 'notable',
    sensors: 'VOC elevated, NOx near baseline',
    pattern: 'VOC ≥ 200 idx (+75 above baseline), NOx near baseline. Fires even when VOC is very high — fuel_vapor is checked first and takes priority if PM2.5 is also low.',
    causes: 'Cooking with oil, cleaning products, paint, new furniture off-gassing, personal care products',
    action: 'Increase ventilation. Identify the source — most cooking/cleaning events resolve quickly.',
  },
  {
    label: 'Particulate spike',
    severity: 'warning',
    sensors: 'PM2.5 elevated alone',
    pattern: 'PM2.5 ≥ 25 μg/m³ (+15 above baseline), NOx near baseline',
    causes: 'Candles, incense, vacuum cleaner, wildfire smoke, dust disturbance',
    action: 'Run an air purifier. Check for nearby smoke or fire sources.',
  },
  {
    label: 'Poor ventilation',
    severity: 'notable',
    sensors: 'CO₂ sustained high',
    pattern: 'CO₂ ≥ 1000 ppm for ≥ 30 min. Warning ≥ 1500 ppm, Critical ≥ 2000 ppm',
    causes: 'Occupied room with insufficient fresh air exchange — sealed windows, high occupancy',
    action: 'Open a window or increase HVAC fresh air. Cognitive impact measurable above 1000 ppm.',
  },
]

function fmtTime(d: Date) {
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(min: number) {
  if (min < 60) return `${Math.round(min)} min`
  return `${(min / 60).toFixed(1)} hr`
}

type DateGroup = 'today' | 'yesterday' | 'this-week' | 'last-week' | 'earlier'

function getDateGroup(d: Date): DateGroup {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday.getTime() - 86400_000)
  const startOfThisWeek = new Date(startOfToday.getTime() - startOfToday.getDay() * 86400_000)
  const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 86400_000)

  if (d >= startOfToday) return 'today'
  if (d >= startOfYesterday) return 'yesterday'
  if (d >= startOfThisWeek) return 'this-week'
  if (d >= startOfLastWeek) return 'last-week'
  return 'earlier'
}

const GROUP_LABEL: Record<DateGroup, (now: Date) => string> = {
  'today': (now) => `Today, ${now.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}`,
  'yesterday': (now) => {
    const d = new Date(now); d.setDate(d.getDate() - 1)
    return `Yesterday, ${d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}`
  },
  'this-week': () => 'This Week',
  'last-week': () => 'Last Week',
  'earlier': () => 'Earlier',
}

const GROUP_ORDER: DateGroup[] = ['today', 'yesterday', 'this-week', 'last-week', 'earlier']

function Legend() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">What we monitor</span>
        <svg
          className={`w-4 h-4 text-zinc-600 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
        >
          <polyline points="4 6 8 10 12 6" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-px border-t border-zinc-800/60 pt-3">
          <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
            The sensor detects six real-world patterns by combining readings from the NOx, VOC, PM2.5, and CO₂ channels.
            Each event must persist for at least 3 minutes (or 80% of samples in a 3-minute window) to filter out single-spike noise.
            Confidence scores reflect how far readings exceeded their thresholds and how long the event lasted.
          </p>
          <div className="grid gap-3">
            {EVENT_LEGEND.map(e => (
              <div key={e.label} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${SEVERITY_STYLES[e.severity]}`}>
                    {e.severity}
                  </span>
                  <span className="text-sm font-medium text-zinc-200">{e.label}</span>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  <span className="text-zinc-600 shrink-0">Signals</span>
                  <span className="text-zinc-400">{e.sensors}</span>
                  <span className="text-zinc-600 shrink-0">Threshold</span>
                  <span className="text-zinc-500">{e.pattern}</span>
                  <span className="text-zinc-600 shrink-0">Causes</span>
                  <span className="text-zinc-400">{e.causes}</span>
                  <span className="text-zinc-600 shrink-0">Action</span>
                  <span className="text-zinc-300">{e.action}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-700 pt-3">
            Thresholds are conservative by design. After a few weeks of real data, revisit VOC-only criteria if common household activities (cooking, sunscreen) trigger false positives.
          </p>
        </div>
      )}
    </div>
  )
}

export function EventsLog() {
  const [events, setEvents] = useState<AirQualityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [timelineRange, setTimelineRange] = useState<typeof TIMELINE_RANGES[number]['key']>('7d')
  const [reprocessing, setReprocessing] = useState(false)
  const [reprocessResult, setReprocessResult] = useState<{ readingsProcessed: number; eventsFound: number; span: { from: string; to: string } | null } | null>(null)

  function loadEvents() {
    return fetch('/api/events?limit=200')
      .then(r => r.ok ? r.json() : [])
      .then((data: AirQualityEvent[]) => {
        setEvents(data.map(e => ({
          ...e,
          startTime: new Date(e.startTime),
          endTime: e.endTime ? new Date(e.endTime) : null,
        })))
      })
      .catch(() => { })
  }

  useEffect(() => {
    loadEvents().finally(() => setLoading(false))
  }, [])

  async function handleReprocess() {
    setReprocessing(true)
    setReprocessResult(null)
    try {
      const res = await fetch('/api/events/reprocess', { method: 'POST' })
      if (res.ok) {
        const result = await res.json()
        setReprocessResult(result)
        await loadEvents()
      }
    } finally {
      setReprocessing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-emerald-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-zinc-100">Air Quality Events</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-600">{events.length} recorded</span>
            <button
              onClick={handleReprocess}
              disabled={reprocessing}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {reprocessing ? 'Processing…' : 'Reprocess History'}
            </button>
          </div>
        </div>

        {reprocessResult && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 px-4 py-2.5 text-xs text-emerald-300 flex items-center gap-3 flex-wrap">
            <span>Found <strong>{reprocessResult.eventsFound}</strong> event{reprocessResult.eventsFound !== 1 ? 's' : ''} in <strong>{reprocessResult.readingsProcessed.toLocaleString()}</strong> readings</span>
            {reprocessResult.span && (
              <span className="text-emerald-500/60">
                {new Date(reprocessResult.span.from).toLocaleDateString([], { month: 'short', day: 'numeric' })} → {new Date(reprocessResult.span.to).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        )}

        <Legend />

        {events.length > 0 && (
          <EventTimeline
            events={events}
            range={timelineRange}
            onRangeChange={setTimelineRange}
          />
        )}

        {events.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center">
            <p className="text-sm text-zinc-500">No events recorded yet.</p>
            <p className="text-xs text-zinc-700 mt-1">Events are detected from live sensor readings as they arrive.</p>
          </div>
        )}

        {(() => {
          const now = new Date()
          const grouped = new Map<DateGroup, AirQualityEvent[]>()
          for (const e of events) {
            const g = getDateGroup(e.startTime)
            if (!grouped.has(g)) grouped.set(g, [])
            grouped.get(g)!.push(e)
          }
          return (
            <div className="space-y-6">
              {GROUP_ORDER.filter(g => grouped.has(g)).map(g => (
                <div key={g} className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-600 px-1">
                    {GROUP_LABEL[g](now)}
                  </h2>
                  {grouped.get(g)!.map(event => (
                    <Link
                      key={event.id}
                      href={`/events/${event.id}`}
                      className={`block rounded-xl border bg-zinc-900/40 px-4 py-3 space-y-2 transition-opacity hover:bg-zinc-900/60 ${event.acknowledged ? 'opacity-40 border-zinc-800' : SEVERITY_BORDER[event.severity]}`}
                    >
                      {/* Title row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                          <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md border ${SEVERITY_STYLES[event.severity]}`}>
                            {event.severity}
                          </span>
                          <span className="text-sm font-semibold text-zinc-100 leading-snug">
                            {event.title}
                          </span>
                          <span className="text-xs text-zinc-500">{TYPE_LABEL[event.type]}</span>
                        </div>
                        {event.acknowledged && <span className="shrink-0 text-xs text-zinc-600">dismissed</span>}
                        {!event.endTime && !event.acknowledged && (
                          <span className="shrink-0 text-xs text-emerald-500 animate-pulse">ongoing</span>
                        )}
                      </div>

                      {/* Time row */}
                      <div className="flex items-center gap-2.5 text-xs text-zinc-600">
                        <span>{fmtTime(event.startTime)}</span>
                        {event.endTime && (
                          <><span className="text-zinc-800">→</span><span>{fmtTime(event.endTime)}</span></>
                        )}
                        <span className="text-zinc-800">·</span>
                        <span>{fmtDuration(event.durationMinutes)}</span>
                        <span className="text-zinc-800">·</span>
                        <span>{Math.round(event.confidence * 100)}% confidence</span>
                      </div>

                      <p className="text-xs text-zinc-400 leading-relaxed">{event.description}</p>

                      {event.recommendation && (
                        <p className="text-xs text-zinc-500 italic">{event.recommendation}</p>
                      )}

                      {/* Peak readings */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-zinc-600 pt-0.5">
                        <span>NOx <span className="text-zinc-400">{event.peak.noxIndex}</span></span>
                        <span>VOC <span className="text-zinc-400">{event.peak.tvocIndex}</span></span>
                        <span>PM2.5 <span className="text-zinc-400">{event.peak.pm02.toFixed(1)}</span></span>
                        <span>CO₂ <span className="text-zinc-400">{event.peak.rco2}</span></span>
                        <span className="text-zinc-700">baseline:</span>
                        <span>NOx <span className="text-zinc-500">{event.baseline.noxIndex}</span></span>
                        <span>PM2.5 <span className="text-zinc-500">{event.baseline.pm02.toFixed(1)}</span></span>
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
