'use client'

import { memo, useMemo, useState } from 'react'
import type { StatusColor } from '@/lib/types'
import type { AirQualityEvent, Severity } from '@/lib/eventTypes'
import { NEUTRAL_HEX, STATUS_COLORS } from '@/lib/statusColors'

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

const SEVERITY_ORDER: Severity[] = ['info', 'notable', 'warning', 'critical']

const VW = 800
const VH = 160
const PAD = { l: 48, r: 12, t: 10, b: 26 }
const CW = VW - PAD.l - PAD.r
const CH = VH - PAD.t - PAD.b
/** Never bridge a hole in the data longer than this with a line. */
const MIN_GAP_MS = 60_000

function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** Values may be averages of downsampled buckets, so always format, never assume integers. */
function fmt(v: number) {
  return v.toFixed(Math.abs(v) < 10 ? 1 : 0)
}

interface ChartProps {
  label: string
  unit: string
  values: number[]
  timestamps: number[]
  status: StatusColor
  statusFn?: (value: number) => StatusColor
  events?: AirQualityEvent[]
  /** Data is stale: draw in neutral grey. */
  muted?: boolean
}

interface Geometry {
  vals: number[]
  ts: number[]
  tMin: number
  tMax: number
  lo: number
  hi: number
  /** [start, end] index ranges of continuous data (split at gaps). */
  segments: [number, number][]
  dayBoundaries: number[]
}

function buildGeometry(values: number[], timestamps: number[]): Geometry | null {
  // Drop entries where the value is missing or non-finite so downstream math never sees NaN
  const vals: number[] = []
  const ts: number[] = []
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    const t = timestamps[i]
    if (Number.isFinite(v) && Number.isFinite(t)) { vals.push(v); ts.push(t) }
  }
  if (vals.length < 2) return null

  // Loops, not Math.min(...vals): spreading tens of thousands of values throws RangeError.
  let min = Infinity
  let max = -Infinity
  for (const v of vals) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const pad = (max - min) * 0.12 || 1

  const tMin = ts[0]
  const tMax = ts[ts.length - 1] > tMin ? ts[ts.length - 1] : tMin + 1

  // Gap threshold from the typical spacing (works for raw 10 s data and for buckets).
  const deltas = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b)
  const typical = deltas[deltas.length >> 1] ?? 0
  const gapMs = Math.max(MIN_GAP_MS, typical * 5)
  const segments: [number, number][] = []
  let segStart = 0
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - ts[i - 1] > gapMs) {
      segments.push([segStart, i - 1])
      segStart = i
    }
  }
  segments.push([segStart, ts.length - 1])

  // Indices where the calendar day changes (midnight crossings)
  const dayBoundaries: number[] = []
  let prevDay = new Date(ts[0]).toDateString()
  for (let i = 1; i < ts.length; i++) {
    const day = new Date(ts[i]).toDateString()
    if (day !== prevDay) dayBoundaries.push(i)
    prevDay = day
  }

  return { vals, ts, tMin, tMax, lo: min - pad, hi: max + pad, segments, dayBoundaries }
}

export const Chart = memo(function Chart({ label, unit, values, timestamps, status, statusFn, events, muted = false }: ChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [colorMode, setColorMode] = useState<'uniform' | 'by-range'>('uniform')
  const [hoveredEvent, setHoveredEvent] = useState<AirQualityEvent | null>(null)

  const geo = useMemo(() => buildGeometry(values, timestamps), [values, timestamps])

  const drawn = useMemo(() => {
    if (!geo) return null
    const { vals, ts, tMin, tMax, lo, hi, segments } = geo
    // x is proportional to time, so gaps and event overlays line up.
    const toX = (t: number) => PAD.l + ((t - tMin) / (tMax - tMin)) * CW
    const toY = (v: number) => PAD.t + CH - ((v - lo) / (hi - lo)) * CH
    const base = (PAD.t + CH).toFixed(1)

    const lines: string[] = []
    let area = ''
    for (const [a, b] of segments) {
      let pts = ''
      for (let i = a; i <= b; i++) pts += `${i > a ? ' ' : ''}${toX(ts[i]).toFixed(1)},${toY(vals[i]).toFixed(1)}`
      lines.push(pts)
      area += `M ${toX(ts[a]).toFixed(1)},${base} L ${pts.replaceAll(' ', ' L ')} L ${toX(ts[b]).toFixed(1)},${base} Z `
    }
    return { toX, toY, lines, area }
  }, [geo])

  const sortedEvents = useMemo(() => {
    if (!geo) return []
    // Events visible in this chart's time window (confidence >= 0.5 to avoid low-confidence noise)
    return (events ?? [])
      .filter(e => {
        if (e.confidence < 0.5) return false
        const start = e.startTime.getTime()
        const end = e.endTime?.getTime() ?? geo.tMax
        return end >= geo.tMin && start <= geo.tMax
      })
      // critical renders on top (last = highest z-order in SVG)
      .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
  }, [events, geo])

  if (!geo || !drawn) return null
  const { vals, ts, tMin, tMax, lo, hi, segments, dayBoundaries } = geo
  const { toX, toY } = drawn
  const isMultiDay = dayBoundaries.length > 0
  const color = muted ? NEUTRAL_HEX : STATUS_COLORS[status].hex

  const tsToX = (t: number) => PAD.l + Math.max(0, Math.min(1, (t - tMin) / (tMax - tMin))) * CW

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({ y: PAD.t + CH - t * CH, value: lo + t * (hi - lo) }))
  const xTicks = [0, 1 / 3, 2 / 3, 1].map(f => tMin + f * (tMax - tMin))

  function nearestIndex(t: number): number {
    let lo = 0
    let hi = ts.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (ts[mid] < t) lo = mid + 1
      else hi = mid
    }
    return lo > 0 && t - ts[lo - 1] < ts[lo] - t ? lo - 1 : lo
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * VW
    const frac = Math.max(0, Math.min(1, (svgX - PAD.l) / CW))
    setHovered(nearestIndex(tMin + frac * (tMax - tMin)))
  }

  const displayValue = hovered !== null ? vals[hovered] : vals[vals.length - 1]
  const hoveredColor = (hovered !== null && statusFn && colorMode === 'by-range' && !muted)
    ? STATUS_COLORS[statusFn(vals[hovered])].hex
    : color

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 pt-4 pb-2">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">{label}</span>
        <span className="text-xs text-zinc-500">{unit}</span>
        <span
          className="text-xs font-medium px-1.5 py-0.5 rounded-md border"
          style={{ color, borderColor: `${color}40`, backgroundColor: `${color}18` }}
        >
          {muted ? 'Stale' : STATUS_COLORS[status].label}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {statusFn && (
            <button
              type="button"
              onClick={() => setColorMode(m => m === 'uniform' ? 'by-range' : 'uniform')}
              aria-pressed={colorMode === 'by-range'}
              className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${colorMode === 'by-range'
                ? 'bg-zinc-700 border-zinc-600 text-zinc-200'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
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
        role="img"
        aria-label={`${label} history, latest ${fmt(vals[vals.length - 1])} ${unit}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHovered(null); setHoveredEvent(null) }}
      >
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={t.y} x2={VW - PAD.r} y2={t.y} stroke="#27272a" strokeWidth="1" />
            <text x={PAD.l - 6} y={t.y} textAnchor="end" dominantBaseline="middle" fill="#71717a" fontSize="11">
              {t.value < 10 ? t.value.toFixed(1) : Math.round(t.value)}
            </text>
          </g>
        ))}

        {/* Event range overlays — rendered before the data line so they sit behind it */}
        {sortedEvents.map(event => {
          if (event.severity === 'info') return null
          const x1 = tsToX(event.startTime.getTime())
          const x2 = tsToX(event.endTime?.getTime() ?? (tMax + 60000))
          const eColor = EVENT_COLOR[event.severity]
          const opacity = EVENT_OPACITY[event.severity]
          const isDashed = event.severity === 'notable'
          return (
            <g
              key={event.id}
              onMouseEnter={() => setHoveredEvent(event)}
              onMouseLeave={() => setHoveredEvent(null)}
            >
              <rect x={x1} y={PAD.t} width={Math.max(2, x2 - x1)} height={CH} fill={eColor} fillOpacity={opacity} />
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

        {colorMode === 'uniform' || muted
          ? <path d={drawn.area} fill={color} fillOpacity={0.1} />
          : <path d={drawn.area} fill="#52525b" fillOpacity={0.05} />
        }
        {colorMode === 'uniform' || !statusFn || muted
          ? drawn.lines.map((pts, i) => (
            <polyline key={i} points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ))
          : segments.flatMap(([a, b]) => {
            const out = []
            for (let i = a; i < b; i++) {
              out.push(
                <line
                  key={i}
                  x1={toX(ts[i]).toFixed(1)} y1={toY(vals[i]).toFixed(1)}
                  x2={toX(ts[i + 1]).toFixed(1)} y2={toY(vals[i + 1]).toFixed(1)}
                  stroke={STATUS_COLORS[statusFn(vals[i])].hex}
                  strokeWidth="2"
                  strokeLinecap="round"
                />,
              )
            }
            return out
          })
        }
        {dayBoundaries.map(idx => {
          const bx = toX(ts[idx])
          return (
            <g key={idx}>
              <line x1={bx} y1={PAD.t} x2={bx} y2={PAD.t + CH} stroke="#3f3f46" strokeWidth="1" strokeDasharray="3 3" />
              <text x={bx + 4} y={PAD.t + 11} fill="#71717a" fontSize="10" fontWeight="500">
                {fmtDate(ts[idx])}
              </text>
            </g>
          )
        })}
        {xTicks.map((t, i) => (
          <text key={i} x={toX(t)} y={VH - 4} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} fill="#71717a" fontSize="11">
            {isMultiDay && i === 0 ? `${fmtDate(t)} ${fmtTime(t)}` : fmtTime(t)}
          </text>
        ))}

        {/* Hovered event tooltip */}
        {hoveredEvent && (() => {
          const eColor = EVENT_COLOR[hoveredEvent.severity]
          const midTs = hoveredEvent.startTime.getTime() + ((hoveredEvent.endTime?.getTime() ?? tMax) - hoveredEvent.startTime.getTime()) / 2
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
              <text x={TX + TW / 2} y={TY + 42} textAnchor="middle" fill="#a1a1aa" fontSize="10">
                {Math.round(hoveredEvent.durationMinutes)} min · confidence {Math.round(hoveredEvent.confidence * 100)}%
              </text>
            </g>
          )
        })()}

        {hovered !== null && hovered < vals.length && (() => {
          const tx = toX(ts[hovered])
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
              <text x={TX + TW / 2} y={TY + 28} textAnchor="middle" fill="#a1a1aa" fontSize="10">
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
})
