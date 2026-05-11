'use client'

import { useEffect, useState } from 'react'
import type { AirQualityEvent, Severity, EventType } from '@/lib/eventTypes'

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
  warning:  'bg-amber-500/15 text-amber-300 border-amber-500/30',
  notable:  'bg-blue-500/15 text-blue-300 border-blue-500/30',
  info:     'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

const TYPE_LABEL: Record<EventType, string> = {
  combustion_exhaust: 'Combustion exhaust',
  fuel_vapor:         'Fuel vapor',
  outdoor_drift:      'Outdoor drift',
  voc_event:          'VOC event',
  particulate_spike:  'Particulate spike',
  ventilation_poor:   'Poor ventilation',
}

function fmtTime(d: Date) {
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(min: number) {
  if (min < 60) return `${Math.round(min)} min`
  return `${(min / 60).toFixed(1)} hr`
}

export function EventsLog() {
  const [events, setEvents] = useState<AirQualityEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/events?limit=200')
      .then(r => r.ok ? r.json() : [])
      .then((data: AirQualityEvent[]) => {
        // Rehydrate Date objects
        setEvents(data.map(e => ({
          ...e,
          startTime: new Date(e.startTime),
          endTime: e.endTime ? new Date(e.endTime) : null,
        })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold text-zinc-100">Air Quality Events</h1>
          <span className="text-xs text-zinc-600">{events.length} recorded</span>
        </div>

        {events.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center">
            <p className="text-sm text-zinc-500">No events recorded yet.</p>
            <p className="text-xs text-zinc-700 mt-1">Events are detected from live sensor readings as they arrive.</p>
          </div>
        )}

        <div className="space-y-2">
          {events.map(event => (
            <div
              key={event.id}
              className={`rounded-xl border bg-zinc-900/40 px-4 py-3 space-y-1.5 transition-opacity ${event.acknowledged ? 'opacity-50' : ''}`}
              style={{ borderColor: event.acknowledged ? '#27272a' : undefined }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${SEVERITY_STYLES[event.severity]}`}>
                  {event.severity}
                </span>
                <span className="text-xs text-zinc-500">{TYPE_LABEL[event.type]}</span>
                <span className="text-sm font-medium text-zinc-200">{event.title}</span>
                {event.acknowledged && <span className="text-xs text-zinc-600 ml-auto">dismissed</span>}
                {!event.endTime && !event.acknowledged && (
                  <span className="text-xs text-emerald-500/80 ml-auto animate-pulse">ongoing</span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span>{fmtTime(event.startTime)}</span>
                {event.endTime && <><span className="text-zinc-700">→</span><span>{fmtTime(event.endTime)}</span></>}
                <span className="text-zinc-700">·</span>
                <span>{fmtDuration(event.durationMinutes)}</span>
                <span className="text-zinc-700">·</span>
                <span>{Math.round(event.confidence * 100)}% confidence</span>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">{event.description}</p>

              {event.recommendation && (
                <p className="text-xs text-zinc-500 italic">{event.recommendation}</p>
              )}

              <div className="flex items-center gap-4 text-xs text-zinc-600 font-mono pt-0.5">
                <span>NOx <span className="text-zinc-400">{event.peak.noxIndex}</span></span>
                <span>VOC <span className="text-zinc-400">{event.peak.tvocIndex}</span></span>
                <span>PM2.5 <span className="text-zinc-400">{event.peak.pm02.toFixed(1)}</span></span>
                <span>CO₂ <span className="text-zinc-400">{event.peak.rco2}</span></span>
                <span className="text-zinc-700">vs baseline:</span>
                <span>NOx <span className="text-zinc-500">{event.baseline.noxIndex}</span></span>
                <span>PM2.5 <span className="text-zinc-500">{event.baseline.pm02.toFixed(1)}</span></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
