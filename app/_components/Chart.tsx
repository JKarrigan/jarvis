'use client'

import { useState } from 'react'
import type { StatusColor } from '@/lib/types'
import type { AirQualityEvent, Severity } from '@/lib/eventTypes'

const strokeColor: Record<StatusColor, string> = {
  good: '#34d399',
  moderate: '#facc15',
  sensitive: '#fb923c',
  unhealthy: '#ef4444',
  'very-unhealthy': '#a855f7',
  hazardous: '#9f1239',
}

const statusLabel: Record<StatusColor, string> = {
  good: 'Good',
  moderate: 'Moderate',
  sensitive: 'Sensitive',
  unhealthy: 'Unhealthy',
  'very-unhealthy': 'Very Unhealthy',
  hazardous: 'Hazardous',
}

const EVENT_COLOR: Record<Severity, string> = {
  critical: '#dc2626',
  warning: '#f59e0b',
  notable: '#3b82f6',
  info: '#9ca3af',
}

const EVENT_OPACITY: Record<Severity, number> = {
  critical: 0.15,
  warning: 0.10,
  notable: 0.06,
  info: 0,
}

const VW = 800
const VH = 160
const PAD = { l: 48, r: 12, t: 10, b: 26 }
const CW = VW - PAD.l - PAD.r
const CH = VH - PAD.t - PAD.b

function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

interface ChartProps {
  label: string
  unit: string
  values: number[]
  timestamps: number[]
  status: StatusColor
  statusFn?: (value: number) => StatusColor
  events?: AirQualityEvent[]
}

export function Chart({ label, unit, values, timestamps, status, statusFn, events }: ChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [colorMode, setColorMode] = useState<'uniform' | 'by-range'>('uniform')
  const [hoveredEvent, setHoveredEvent] = useState<AirQualityEvent | null>(null)

  // Drop entries where the value is missing or non-finite so downstream math never sees NaN
  const { vals, ts } = values.reduce<{ vals: number[]; ts: number[] }>(
    (acc, v, i) => { if (Number.isFinite(v)) { acc.vals.push(v); acc.ts.push(timestamps[i]) } return acc },
    { vals: [], ts: [] }
  )

  if (vals.length < 2) return null

  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const pad = (max - min) * 0.12 || 1
  const lo = min - pad
  const hi = max + pad

  const toX = (i: number) => PAD.l + (i / (vals.length - 1)) * CW
  const toY = (v: number) => PAD.t + CH - ((v - lo) / (hi - lo)) * CH

  // Map a UTC ms timestamp to SVG x, clamped to the chart bounds
  const tsToX = (eventTs: number) => {
    const tMin = ts[0]
    const tMax = ts[ts.length - 1]
    const frac = (eventTs - tMin) / (tMax - tMin)
    return PAD.l + Math.max(0, Math.min(1, frac)) * CW
  }

  const points = vals.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
  const color = strokeColor[status]

  const areaPath = [
    `M ${toX(0).toFixed(1)},${(PAD.t + CH).toFixed(1)}`,
    ...vals.map((v, i) => `L ${toX(i).toFixed(1)},${toY(v).toFixed(1)}`),
    `L ${toX(vals.length - 1).toFixed(1)},${(PAD.t + CH).toFixed(1)}`,
    'Z',
  ].join(' ')

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    y: PAD.t + CH - t * CH,
    value: lo + t * (hi - lo),
  }))

  const xIndices = Array.from(new Set([
    0,
    Math.floor((vals.length - 1) / 3),
    Math.floor((vals.length - 1) * 2 / 3),
    vals.length - 1,
  ]))

  // Indices where the calendar day changes (midnight crossings)
  const dayBoundaries = ts.reduce<number[]>((acc, t, i) => {
    if (i > 0 && new Date(t).toDateString() !== new Date(ts[i - 1]).toDateString()) acc.push(i)
    return acc
  }, [])
  const isMultiDay = dayBoundaries.length > 0

  const chartEnd = ts[ts.length - 1]

  // Events visible in this chart's time window (confidence >= 0.5 to avoid low-confidence noise)
  const visibleEvents = (events ?? []).filter(e => {
    if (e.confidence < 0.5) return false
    const start = e.startTime.getTime()
    const end = e.endTime?.getTime() ?? chartEnd
    return end >= ts[0] && start <= chartEnd
  })

  // Sort events so critical renders on top (last = highest z-order in SVG)
  const severityOrder: Severity[] = ['info', 'notable', 'warning', 'critical']
  const sortedEvents = [...visibleEvents].sort(
    (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
  )

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * VW
    const i = Math.round(Math.max(0, Math.min(vals.length - 1, (svgX - PAD.l) / CW * (vals.length - 1))))
    setHovered(i)
  }

  const displayValue = hovered !== null ? vals[hovered] : vals[vals.length - 1]
  const fmt = (v: number) => v.toFixed(v < 10 ? 1 : 0)

  const hoveredColor = (hovered !== null && statusFn && colorMode === 'by-range')
    ? strokeColor[statusFn(vals[hovered])]
    : color

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 pt-4 pb-2">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</span>
        <span className="text-xs text-zinc-600">{unit}</span>
        <span
          className="text-xs font-medium px-1.5 py-0.5 rounded-md border"
          style={{ color, borderColor: `${color}40`, backgroundColor: `${color}18` }}
        >
          {statusLabel[status]}
        </span>
        {visibleEvents.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {visibleEvents.map(e => (
              <span
                key={e.id}
                className="text-xs px-1.5 py-0.5 rounded-md border font-medium"
                style={{
                  color: EVENT_COLOR[e.severity],
                  borderColor: `${EVENT_COLOR[e.severity]}40`,
                  backgroundColor: `${EVENT_COLOR[e.severity]}18`,
                }}
              >
                {e.title}
              </span>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {statusFn && (
            <button
              onClick={() => setColorMode(m => m === 'uniform' ? 'by-range' : 'uniform')}
              className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${
                colorMode === 'by-range'
                  ? 'bg-zinc-700 border-zinc-600 text-zinc-200'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {colorMode === 'by-range' ? 'By Range' : 'Uniform'}
            </button>
          )}
          <span className="text-xs font-mono transition-all" style={{ color }}>{fmt(displayValue)}</span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        className="overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHovered(null); setHoveredEvent(null) }}
      >
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={t.y} x2={VW - PAD.r} y2={t.y} stroke="#27272a" strokeWidth="1" />
            <text x={PAD.l - 6} y={t.y} textAnchor="end" dominantBaseline="middle" fill="#52525b" fontSize="11">
              {t.value < 10 ? t.value.toFixed(1) : Math.round(t.value)}
            </text>
          </g>
        ))}

        {/* Event range overlays — rendered before the data line so they sit behind it */}
        {sortedEvents.map(event => {
          if (event.severity === 'info') return null
          const x1 = tsToX(event.startTime.getTime())
          const x2 = tsToX(event.endTime?.getTime() ?? (ts[ts.length - 1] + 60000))
          const eColor = EVENT_COLOR[event.severity]
          const opacity = EVENT_OPACITY[event.severity]
          const isDashed = event.severity === 'notable'
          return (
            <g
              key={event.id}
              onMouseEnter={() => setHoveredEvent(event)}
              onMouseLeave={() => setHoveredEvent(null)}
            >
              <rect
                x={x1}
                y={PAD.t}
                width={Math.max(2, x2 - x1)}
                height={CH}
                fill={eColor}
                fillOpacity={opacity}
              />
              {isDashed ? (
                <>
                  <line x1={x1} y1={PAD.t} x2={x1} y2={PAD.t + CH} stroke={eColor} strokeWidth="1" strokeOpacity="0.5" strokeDasharray="3 3" />
                  <line x1={x2} y1={PAD.t} x2={x2} y2={PAD.t + CH} stroke={eColor} strokeWidth="1" strokeOpacity="0.5" strokeDasharray="3 3" />
                </>
              ) : (
                <line x1={x1} y1={PAD.t} x2={x2} y2={PAD.t} stroke={eColor} strokeWidth="2" strokeOpacity="0.8" />
              )}
            </g>
          )
        })}

        {colorMode === 'uniform'
          ? <path d={areaPath} fill={color} fillOpacity={0.1} />
          : <path d={areaPath} fill="#52525b" fillOpacity={0.05} />
        }
        {colorMode === 'uniform' || !statusFn
          ? (
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          )
          : (
            vals.slice(0, -1).map((v, i) => (
              <line
                key={i}
                x1={toX(i).toFixed(1)} y1={toY(v).toFixed(1)}
                x2={toX(i + 1).toFixed(1)} y2={toY(vals[i + 1]).toFixed(1)}
                stroke={strokeColor[statusFn(v)]}
                strokeWidth="2"
                strokeLinecap="round"
              />
            ))
          )
        }
        {dayBoundaries.map(idx => {
          const bx = toX(idx)
          return (
            <g key={idx}>
              <line x1={bx} y1={PAD.t} x2={bx} y2={PAD.t + CH} stroke="#3f3f46" strokeWidth="1" strokeDasharray="3 3" />
              <text x={bx + 4} y={PAD.t + 11} fill="#52525b" fontSize="10" fontWeight="500">
                {fmtDate(ts[idx])}
              </text>
            </g>
          )
        })}
        {xIndices.map((idx, i) => (
          <text key={i} x={toX(idx)} y={VH - 4} textAnchor="middle" fill="#52525b" fontSize="11">
            {fmtTime(ts[idx])}
          </text>
        ))}

        {/* Hovered event tooltip */}
        {hoveredEvent && (() => {
          const eColor = EVENT_COLOR[hoveredEvent.severity]
          const midTs = hoveredEvent.startTime.getTime() + ((hoveredEvent.endTime?.getTime() ?? chartEnd) - hoveredEvent.startTime.getTime()) / 2
          const tx = Math.max(PAD.l + 10, Math.min(VW - PAD.r - 10, tsToX(midTs)))
          const TW = 200
          const TH = 56
          const TX = Math.max(PAD.l, Math.min(VW - PAD.r - TW, tx - TW / 2))
          const TY = PAD.t + 4
          return (
            <g>
              <rect x={TX} y={TY} width={TW} height={TH} rx="4" fill="#18181b" stroke={eColor} strokeWidth="1" strokeOpacity="0.6" />
              <text x={TX + TW / 2} y={TY + 14} textAnchor="middle" fill={eColor} fontSize="12" fontWeight="600">
                {hoveredEvent.title}
              </text>
              <text x={TX + TW / 2} y={TY + 28} textAnchor="middle" fill="#a1a1aa" fontSize="10">
                NOx {hoveredEvent.peak.noxIndex} · PM2.5 {hoveredEvent.peak.pm02.toFixed(1)} · VOC {hoveredEvent.peak.tvocIndex}
              </text>
              <text x={TX + TW / 2} y={TY + 42} textAnchor="middle" fill="#71717a" fontSize="10">
                {Math.round(hoveredEvent.durationMinutes)} min · confidence {Math.round(hoveredEvent.confidence * 100)}%
              </text>
            </g>
          )
        })()}

        {hovered !== null && (() => {
          const tx = toX(hovered)
          const ty = toY(vals[hovered])
          const val = vals[hovered]
          const TW = isMultiDay ? 130 : 100
          const TH = 38
          const TX = Math.max(PAD.l, Math.min(VW - PAD.r - TW, tx - TW / 2))
          const TY = ty - TH - 10 < PAD.t ? ty + 10 : ty - TH - 10
          return (
            <g>
              <line x1={tx} y1={PAD.t} x2={tx} y2={PAD.t + CH} stroke={hoveredColor} strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3 3" />
              <circle cx={tx} cy={ty} r="4" fill={hoveredColor} stroke="#18181b" strokeWidth="2" />
              <rect x={TX} y={TY} width={TW} height={TH} rx="4" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
              <text x={TX + TW / 2} y={TY + 14} textAnchor="middle" fill={hoveredColor} fontSize="13" fontFamily="ui-monospace, monospace" fontWeight="600">
                {fmt(val)} {unit}
              </text>
              <text x={TX + TW / 2} y={TY + 28} textAnchor="middle" fill="#71717a" fontSize="10">
                {isMultiDay ? `${fmtDate(ts[hovered])} ${fmtTime(ts[hovered])}` : fmtTime(ts[hovered])}
              </text>
            </g>
          )
        })()}

        {/* Transparent overlay to capture mouse events across the full chart area */}
        <rect x={PAD.l} y={PAD.t} width={CW} height={CH} fill="transparent" />
      </svg>
    </div>
  )
}
