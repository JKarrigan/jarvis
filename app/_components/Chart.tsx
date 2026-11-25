'use client'

import { memo, useId, useMemo, useState } from 'react'
import type { StatusColor } from '@/lib/types'
import type { AirQualityEvent, Severity } from '@/lib/eventTypes'
import { NEUTRAL_HEX, STATUS_COLORS } from '@/lib/statusColors'
import { chartScale, clipMarks, type ClipMark } from '@/lib/chartScale'
import { METRIC_INFO, SEVERITY_INFO, eventTitle, fmtDuration, fmtMetric, keyMetrics } from '@/lib/eventInfo'

/** Event bands use the one severity palette (lib/eventInfo.ts). */
const EVENT_COLOR: Record<Severity, string> = {
  critical: SEVERITY_INFO.critical.barHex,
  warning: SEVERITY_INFO.warning.barHex,
  notable: SEVERITY_INFO.notable.barHex,
  info: SEVERITY_INFO.info.barHex,
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
  /**
   * Per-point minimum and maximum (downsampled buckets), aligned with `values`.
   * When both are given a band is drawn between them behind the line; points
   * without a finite pair just have no band.
   */
  low?: number[]
  high?: number[]
}

interface Geometry {
  vals: number[]
  ts: number[]
  /** Band edges aligned with `vals` (NaN where there is none); null without a band. */
  lows: number[] | null
  highs: number[] | null
  tMin: number
  tMax: number
  lo: number
  hi: number
  /** Indices whose band edge lies beyond the scale (see lib/chartScale.ts). */
  clippedAbove: number[]
  clippedBelow: number[]
  /** [start, end] index ranges of continuous data (split at gaps). */
  segments: [number, number][]
  dayBoundaries: number[]
}

function buildGeometry(values: number[], timestamps: number[], low?: number[], high?: number[]): Geometry | null {
  // Drop entries where the value is missing or non-finite so downstream math never sees NaN
  const vals: number[] = []
  const ts: number[] = []
  const banded = !!low && !!high
  const lows: number[] = []
  const highs: number[] = []
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    const t = timestamps[i]
    if (!Number.isFinite(v) || !Number.isFinite(t)) continue
    vals.push(v)
    ts.push(t)
    if (banded) {
      const lo = low[i]
      const hi = high[i]
      const ok = Number.isFinite(lo) && Number.isFinite(hi)
      lows.push(ok ? Math.min(lo, v) : NaN)
      highs.push(ok ? Math.max(hi, v) : NaN)
    }
  }
  if (vals.length < 2) return null

  // The line is always in scale; the band only to its typical extent (rare extremes are clipped and marked).
  const { lo, hi, clippedAbove, clippedBelow } = chartScale(vals, banded ? lows : null, banded ? highs : null)

  const tMin = ts[0]
  const tMax = ts[ts.length - 1] > tMin ? ts[ts.length - 1] : tMin + 1

  // Gap threshold from the typical spacing (works for raw 10 s data and for buckets).
  // Where the local spacing is wider than the typical one (minute averages
  // followed by live 10 s readings on the Overview) the local one counts, so
  // only a real hole splits the line.
  const deltas = ts.slice(1).map((t, i) => t - ts[i])
  const sorted = [...deltas].sort((a, b) => a - b)
  const typical = sorted[sorted.length >> 1] ?? 0
  const segments: [number, number][] = []
  let segStart = 0
  for (let i = 1; i < ts.length; i++) {
    const d = deltas[i - 1]
    const local = Math.min(deltas[i - 2] ?? Infinity, deltas[i] ?? Infinity)
    const gapMs = Math.max(MIN_GAP_MS, 5 * Math.max(typical, Number.isFinite(local) ? local : 0))
    if (d > gapMs) {
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

  return {
    vals, ts, lows: banded ? lows : null, highs: banded ? highs : null,
    tMin, tMax, lo, hi, clippedAbove, clippedBelow, segments, dayBoundaries,
  }
}

/**
 * A chart-sized box without a chart: the same card, header row and plot (whose
 * height comes from its aspect ratio), for "loading" and "no data", so swapping
 * it for a real chart moves nothing below it.
 */
export function ChartFrame({ label, unit, children }: { label: string; unit: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-air-line bg-air-card px-4 pb-2 pt-4 md:px-5">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-base font-semibold text-zinc-100">{label}</span>
        <span className="text-sm text-zinc-400">{unit}</span>
        {/* Stand-ins for the status badge, the colour toggle and the value, so the row wraps like a chart's. */}
        <span aria-hidden="true" className="invisible text-xs font-medium px-1.5 py-0.5 rounded-md border">Moderate</span>
        <span aria-hidden="true" className="invisible ml-auto flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-md border">Uniform</span>
          <span className="text-xs font-mono">0000</span>
        </span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" aria-hidden="true" />
        {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
      </div>
    </div>
  )
}

export const Chart = memo(function Chart({ label, unit, values, timestamps, status, statusFn, events, muted = false, low, high }: ChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [colorMode, setColorMode] = useState<'uniform' | 'by-range'>('uniform')
  const [hoveredEvent, setHoveredEvent] = useState<AirQualityEvent | null>(null)
  // Several charts share a page, so the band's clip path needs its own id (useId's colons are not safe in url()).
  const clipId = `chart-band-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const geo = useMemo(() => buildGeometry(values, timestamps, low, high), [values, timestamps, low, high])

  const drawn = useMemo(() => {
    if (!geo) return null
    const { vals, ts, lows, highs, tMin, tMax, lo, hi, segments } = geo
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

    // Min-to-max band: one closed shape per run of points that have both edges, within each segment.
    let band = ''
    if (lows && highs) {
      for (const [a, b] of segments) {
        let i = a
        while (i <= b) {
          if (!Number.isFinite(lows[i])) { i++; continue }
          let j = i
          while (j + 1 <= b && Number.isFinite(lows[j + 1])) j++
          if (j > i) {
            let top = ''
            let bottom = ''
            for (let k = i; k <= j; k++) top += `${k > i ? ' L ' : 'M '}${toX(ts[k]).toFixed(1)},${toY(highs[k]).toFixed(1)}`
            for (let k = j; k >= i; k--) bottom += ` L ${toX(ts[k]).toFixed(1)},${toY(lows[k]).toFixed(1)}`
            band += `${top}${bottom} Z `
          }
          i = j + 1
        }
      }
    }
    // Where the band leaves the scale: one caret per clipped run, a label on the most extreme one per side.
    const marksAbove = highs ? clipMarks(geo.clippedAbove, highs, segments, 'above') : []
    const marksBelow = lows ? clipMarks(geo.clippedBelow, lows, segments, 'below') : []
    const extreme = (marks: ClipMark[], above: boolean) => marks.reduce<ClipMark | null>(
      (best, m) => !best || (above ? m.value > best.value : m.value < best.value) ? m : best, null)
    return {
      toX, toY, lines, area, band, marksAbove, marksBelow,
      labelAbove: extreme(marksAbove, true), labelBelow: extreme(marksBelow, false),
    }
  }, [geo])

  const sortedEvents = useMemo(() => {
    if (!geo) return []
    // Events visible in this chart's time window
    return (events ?? [])
      .filter(e => {
        const start = e.startTime.getTime()
        const end = e.endTime?.getTime() ?? geo.tMax
        return end >= geo.tMin && start <= geo.tMax
      })
      // critical renders on top (last = highest z-order in SVG)
      .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
  }, [events, geo])

  if (!geo || !drawn) return null
  const { vals, ts, lows, highs, tMin, tMax, lo, hi, segments, dayBoundaries } = geo
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
  /** "67 (3 to 226)": the average and, for a downsampled point, its range. */
  const readout = (i: number) => {
    const lo = lows?.[i]
    const hi = highs?.[i]
    return lo !== undefined && hi !== undefined && Number.isFinite(lo) && Number.isFinite(hi)
      ? `${fmt(vals[i])} (${fmt(lo)} to ${fmt(hi)})`
      : fmt(vals[i])
  }
  const hoveredColor = (hovered !== null && statusFn && colorMode === 'by-range' && !muted)
    ? STATUS_COLORS[statusFn(vals[hovered])].hex
    : color

  return (
    <div className="rounded-2xl border border-air-line bg-air-card px-4 pb-2 pt-4 md:px-5">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-base font-semibold text-zinc-100">{label}</span>
        <span className="text-sm text-zinc-400">{unit}</span>
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
                ? 'bg-air-active border-transparent text-white'
                : 'bg-air-raised border-air-line text-zinc-400 hover:text-white'
                }`}
            >
              {colorMode === 'by-range' ? 'By Range' : 'Uniform'}
            </button>
          )}
          <span className="text-xs font-mono transition-all" style={{ color }}>{hovered !== null ? readout(hovered) : fmt(displayValue)}</span>
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
        {/* Range of each downsampled point, behind the line (grey while the line is coloured by range).
            The thin outline keeps a one-point spike visible: a fill alone is a pixel wide there. */}
        {drawn.band && (() => {
          const bandColor = colorMode === 'uniform' || muted ? color : NEUTRAL_HEX
          const top = PAD.t
          const bottom = PAD.t + CH
          // Labels stay inside the plot: after the caret, or before it near the right edge.
          const label = (m: ClipMark, y: number) => {
            const x = toX(ts[m.index])
            const flip = x > VW - PAD.r - 48
            return (
              <text
                x={flip ? x - 7 : x + 7} y={y} textAnchor={flip ? 'end' : 'start'} dominantBaseline="middle"
                fill={bandColor} fontSize="10" fontWeight="500"
                stroke="#111113" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round"
              >
                {fmt(m.value)}
              </text>
            )
          }
          return (
            <>
              <clipPath id={clipId}>
                <rect x={PAD.l} y={top} width={CW} height={CH} />
              </clipPath>
              <path
                d={drawn.band} clipPath={`url(#${clipId})`}
                fill={bandColor} fillOpacity={0.2}
                stroke={bandColor} strokeOpacity={0.5} strokeWidth="1" strokeLinejoin="round"
              />
              {/* Carets where the band runs past the scale, so a flat edge is not read as data hitting a ceiling. */}
              {drawn.marksAbove.map(m => {
                const x = toX(ts[m.index])
                return <path key={`a${m.index}`} d={`M ${(x - 4).toFixed(1)},${top + 5} L ${x.toFixed(1)},${top} L ${(x + 4).toFixed(1)},${top + 5} Z`} fill={bandColor} />
              })}
              {drawn.marksBelow.map(m => {
                const x = toX(ts[m.index])
                return <path key={`b${m.index}`} d={`M ${(x - 4).toFixed(1)},${bottom - 5} L ${x.toFixed(1)},${bottom} L ${(x + 4).toFixed(1)},${bottom - 5} Z`} fill={bandColor} />
              })}
              {/* On a multi-day chart the day names run along the top edge: the value goes under them. */}
              {drawn.labelAbove && label(drawn.labelAbove, isMultiDay ? top + 24 : top + 4)}
              {drawn.labelBelow && label(drawn.labelBelow, bottom - 4)}
            </>
          )
        })()}
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
                {eventTitle(hoveredEvent.type)}
              </text>
              <text x={TX + TW / 2} y={TY + 28} textAnchor="middle" fill="#a1a1aa" fontSize="10">
                {keyMetrics(hoveredEvent).map(m => `${METRIC_INFO[m].short} ${fmtMetric(m, hoveredEvent.peak[m])}`).join(' · ')}
              </text>
              <text x={TX + TW / 2} y={TY + 42} textAnchor="middle" fill="#a1a1aa" fontSize="10">
                {SEVERITY_INFO[hoveredEvent.severity].label} · {fmtDuration(hoveredEvent.durationMinutes)}
              </text>
            </g>
          )
        })()}

        {hovered !== null && hovered < vals.length && (() => {
          const tx = toX(ts[hovered])
          const ty = toY(vals[hovered])
          const text = `${readout(hovered)} ${unit}`
          // Monospace at 13px is ~7.8px a character.
          const TW = Math.max(isMultiDay ? 130 : 100, Math.ceil(text.length * 7.8) + 16)
          const TH = 38
          const TX = Math.max(PAD.l, Math.min(VW - PAD.r - TW, tx - TW / 2))
          const TY = ty - TH - 10 < PAD.t ? ty + 10 : ty - TH - 10
          return (
            <g>
              <line x1={tx} y1={PAD.t} x2={tx} y2={PAD.t + CH} stroke={hoveredColor} strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3 3" />
              <circle cx={tx} cy={ty} r="4" fill={hoveredColor} stroke="#18181b" strokeWidth="2" />
              <rect x={TX} y={TY} width={TW} height={TH} rx="4" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
              <text x={TX + TW / 2} y={TY + 14} textAnchor="middle" fill={hoveredColor} fontSize="13" fontFamily="ui-monospace, monospace" fontWeight="600">
                {text}
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
