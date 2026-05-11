'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { AirQualityEvent, EventType, Severity } from '@/lib/eventTypes'

type RangeKey = '1h' | '6h' | '24h' | '7d' | '30d'

export const TIMELINE_RANGES: { key: RangeKey; label: string; ms: number }[] = [
  { key: '1h',  label: '1h',  ms: 60 * 60 * 1000 },
  { key: '6h',  label: '6h',  ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d',  label: '7d',  ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
]

const EVENT_COLOR: Record<Severity, string> = {
  critical: '#dc2626',
  warning:  '#f59e0b',
  notable:  '#3b82f6',
  info:     '#9ca3af',
}

const TYPE_LABEL: Record<EventType, string> = {
  combustion_exhaust: 'Combustion',
  fuel_vapor:         'Fuel vapor',
  outdoor_drift:      'Outdoor drift',
  voc_event:          'VOC event',
  particulate_spike:  'Particulate',
  ventilation_poor:   'Ventilation',
}

const ALL_TYPES: EventType[] = [
  'combustion_exhaust', 'fuel_vapor', 'outdoor_drift',
  'voc_event', 'particulate_spike', 'ventilation_poor',
]

const VW    = 800
const L_PAD = 100
const R_PAD = 12
const T_PAD = 10
const B_PAD = 26
const ROW_H = 22
const ROW_GAP = 5

function fmtTick(ts: number, rangeKey: RangeKey): string {
  const d = new Date(ts)
  if (rangeKey === '1h' || rangeKey === '6h' || rangeKey === '24h') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function tickIntervalMs(rangeMs: number): number {
  if (rangeMs <= 60 * 60 * 1000)         return 15 * 60 * 1000
  if (rangeMs <= 6 * 60 * 60 * 1000)    return 60 * 60 * 1000
  if (rangeMs <= 24 * 60 * 60 * 1000)   return 4 * 60 * 60 * 1000
  if (rangeMs <= 7 * 24 * 60 * 60 * 1000) return 24 * 60 * 60 * 1000
  return 5 * 24 * 60 * 60 * 1000
}

interface Props {
  events: AirQualityEvent[]
  range: RangeKey
  onRangeChange: (r: RangeKey) => void
}

export function EventTimeline({ events, range, onRangeChange }: Props) {
  const router = useRouter()
  const [hovered, setHovered] = useState<AirQualityEvent | null>(null)

  const rangeMs     = TIMELINE_RANGES.find(r => r.key === range)!.ms
  const now         = Date.now()
  const windowEnd   = now
  const windowStart = now - rangeMs
  const CW          = VW - L_PAD - R_PAD

  const visible = events.filter(e => {
    const start = e.startTime.getTime()
    const end   = e.endTime?.getTime() ?? now
    return end >= windowStart && start <= windowEnd
  })

  const activeTypes = ALL_TYPES.filter(t => visible.some(e => e.type === t))
  const rowTypes    = activeTypes.length > 0 ? activeTypes : []

  const totalH = T_PAD + rowTypes.length * (ROW_H + ROW_GAP) - (rowTypes.length > 0 ? ROW_GAP : 0) + B_PAD

  function tsToX(ts: number): number {
    const frac = (ts - windowStart) / rangeMs
    return L_PAD + Math.max(0, Math.min(1, frac)) * CW
  }

  const interval  = tickIntervalMs(rangeMs)
  const firstTick = Math.ceil(windowStart / interval) * interval
  const ticks: number[] = []
  for (let t = firstTick; t <= windowEnd; t += interval) ticks.push(t)

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 pt-4 pb-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Event Timeline</span>
        <div className="flex items-center gap-1.5">
          {TIMELINE_RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => onRangeChange(r.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                range === r.key
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {rowTypes.length === 0 ? (
        <p className="text-xs text-zinc-600 py-6 text-center">No events in this window</p>
      ) : (
        <svg
          viewBox={`0 0 ${VW} ${totalH}`}
          width="100%"
          className="overflow-visible"
        >
          {/* Vertical grid lines + x-axis labels */}
          {ticks.map(t => {
            const x = tsToX(t)
            const chartBottom = T_PAD + rowTypes.length * (ROW_H + ROW_GAP) - ROW_GAP
            return (
              <g key={t}>
                <line x1={x} y1={T_PAD} x2={x} y2={chartBottom} stroke="#27272a" strokeWidth="1" />
                <text x={x} y={totalH - 4} textAnchor="middle" fill="#52525b" fontSize="10">
                  {fmtTick(t, range)}
                </text>
              </g>
            )
          })}

          {/* Rows */}
          {rowTypes.map((type, rowIdx) => {
            const rowY      = T_PAD + rowIdx * (ROW_H + ROW_GAP)
            const rowEvents = visible.filter(e => e.type === type)
            return (
              <g key={type}>
                <text
                  x={L_PAD - 8}
                  y={rowY + ROW_H / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="#52525b"
                  fontSize="11"
                >
                  {TYPE_LABEL[type]}
                </text>
                <rect x={L_PAD} y={rowY} width={CW} height={ROW_H} fill="#18181b" rx="3" />
                {rowEvents.map(event => {
                  const x1     = tsToX(event.startTime.getTime())
                  const x2     = tsToX(event.endTime?.getTime() ?? now)
                  const w      = Math.max(4, x2 - x1)
                  const eColor = EVENT_COLOR[event.severity]
                  const isHov  = hovered?.id === event.id
                  return (
                    <g
                      key={event.id}
                      onMouseEnter={() => setHovered(event)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => router.push(`/events/${event.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <rect
                        x={x1}
                        y={rowY + 2}
                        width={w}
                        height={ROW_H - 4}
                        rx="2"
                        fill={eColor}
                        fillOpacity={isHov ? 1 : 0.7}
                      />
                      {/* Wider invisible hit target for narrow bars */}
                      <rect
                        x={x1 - 2}
                        y={rowY}
                        width={Math.max(8, w + 4)}
                        height={ROW_H}
                        fill="transparent"
                      />
                    </g>
                  )
                })}
              </g>
            )
          })}

          {/* "Now" marker */}
          {(() => {
            const chartBottom = T_PAD + rowTypes.length * (ROW_H + ROW_GAP) - ROW_GAP
            return (
              <line
                x1={L_PAD + CW} y1={T_PAD}
                x2={L_PAD + CW} y2={chartBottom}
                stroke="#3f3f46" strokeWidth="1" strokeDasharray="3 3"
              />
            )
          })()}

          {/* Hover tooltip */}
          {hovered && (() => {
            const eColor  = EVENT_COLOR[hovered.severity]
            const midTs   = hovered.startTime.getTime() + ((hovered.endTime?.getTime() ?? now) - hovered.startTime.getTime()) / 2
            const rowIdx  = rowTypes.indexOf(hovered.type)
            const rowY    = T_PAD + rowIdx * (ROW_H + ROW_GAP)
            const tx      = tsToX(midTs)
            const TW = 210
            const TH = 52
            const TX = Math.max(L_PAD, Math.min(VW - R_PAD - TW, tx - TW / 2))
            const TY = rowY - TH - 4 < T_PAD ? rowY + ROW_H + 4 : rowY - TH - 4
            const dur = hovered.durationMinutes < 60
              ? `${Math.round(hovered.durationMinutes)} min`
              : `${(hovered.durationMinutes / 60).toFixed(1)} hr`
            const startStr = hovered.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            const endStr   = hovered.endTime
              ? hovered.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'ongoing'
            return (
              <g style={{ pointerEvents: 'none' }}>
                <rect x={TX} y={TY} width={TW} height={TH} rx="4" fill="#18181b" stroke={eColor} strokeWidth="1" strokeOpacity="0.7" />
                <text x={TX + TW / 2} y={TY + 14} textAnchor="middle" fill={eColor} fontSize="12" fontWeight="600">
                  {hovered.title}
                </text>
                <text x={TX + TW / 2} y={TY + 29} textAnchor="middle" fill="#a1a1aa" fontSize="10">
                  {startStr} → {endStr}
                </text>
                <text x={TX + TW / 2} y={TY + 43} textAnchor="middle" fill="#71717a" fontSize="10">
                  {dur} · {Math.round(hovered.confidence * 100)}% confidence
                </text>
              </g>
            )
          })()}
        </svg>
      )}

      <div className="flex items-center gap-4 pt-1 border-t border-zinc-800/60">
        {(['critical', 'warning', 'notable'] as Severity[]).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: EVENT_COLOR[s] }} />
            <span className="text-xs text-zinc-600 capitalize">{s}</span>
          </div>
        ))}
        <span className="text-xs text-zinc-700 ml-auto">hover for details · click to open</span>
      </div>
    </div>
  )
}
