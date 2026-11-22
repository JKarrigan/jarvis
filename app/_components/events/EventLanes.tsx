'use client'

import { useMemo, useState } from 'react'
import { fmtClock, fmtWeekday } from './EventBits'

/**
 * Several readings stacked on one time axis, so it is plain which rose first
 * and how they moved together. Every lane shares the event band, the peak
 * marker and the hover cursor; each has its own vertical scale.
 */

export interface Lane {
  key: string
  label: string
  unit: string
  /** One value per timestamp; null where there was no reading. */
  values: (number | null)[]
  format: (v: number) => string
  /** The number the lane is about (the peak), already formatted. */
  headline?: string
  /** Under the headline: "before 0.7", or a range for readings that are just context. */
  note?: string
  /** Status word with its colour (null colour = neutral) and whether it is the "good" band (dot instead of square). */
  status?: { word: string; hex: string | null; good?: boolean }
  /** The reading the event is about: taller, brighter, with its band lines. */
  lead?: boolean
  /** Horizontal reference lines, drawn only when they fall inside the lane's range. */
  lines?: { value: number; label: string; hex: string }[]
  /** Start the scale at zero (concentrations) instead of at the lowest reading. */
  fromZero?: boolean
}

const W = 1000
const H = 100
const PAD = 7

interface Geometry { path: string; lo: number; hi: number; y: (v: number) => number }

function geometry(lane: Lane, ts: number[], x: (t: number) => number, gapMs: number): Geometry | null {
  let lo = Infinity
  let hi = -Infinity
  for (const v of lane.values) {
    if (v == null || !Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (!Number.isFinite(lo)) return null
  if (lane.fromZero) lo = Math.min(lo, 0)
  if (hi - lo < 1e-9) hi = lo + 1
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD)
  let path = ''
  let pen = false
  for (let i = 0; i < ts.length; i++) {
    const v = lane.values[i]
    if (v == null || !Number.isFinite(v)) { pen = false; continue }
    if (pen && ts[i] - ts[i - 1] > gapMs) pen = false
    path += `${pen ? 'L' : 'M'}${x(ts[i]).toFixed(1)},${y(v).toFixed(1)} `
    pen = true
  }
  return { path, lo, hi, y }
}

const TICK_MINUTES = [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080]

/** At most ~5 ticks on round local clock times. */
function ticks(from: number, to: number): { t: number; label: string }[] {
  const spanMin = (to - from) / 60_000
  const step = (TICK_MINUTES.find(m => spanMin / m <= 4.5) ?? 10080) * 60_000
  const midnight = new Date(from)
  midnight.setHours(0, 0, 0, 0)
  const out: { t: number; label: string }[] = []
  for (let t = midnight.getTime() + Math.ceil((from - midnight.getTime()) / step) * step; t <= to; t += step) {
    out.push({ t, label: spanMin > 24 * 60 ? `${fmtWeekday(t)} ${fmtClock(t)}` : fmtClock(t) })
  }
  return out
}

function nearest(ts: number[], t: number): number {
  let lo = 0
  let hi = ts.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (ts[mid] < t) lo = mid + 1
    else hi = mid
  }
  return lo > 0 && t - ts[lo - 1] < ts[lo] - t ? lo - 1 : lo
}

export function EventLanes({ ts, lanes, from, to, eventStart, eventEnd, markAt, bandHex }: {
  ts: number[]
  lanes: Lane[]
  /** The time window drawn. */
  from: number
  to: number
  eventStart: number
  /** Null while the event is still going: the band runs to the right edge. */
  eventEnd: number | null
  /** A moment to mark across every lane (the lead reading's peak). */
  markAt?: number | null
  bandHex: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const span = Math.max(1, to - from)
  const x = (t: number) => ((t - from) / span) * W
  const gapMs = useMemo(() => {
    const gaps: number[] = []
    for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1])
    gaps.sort((a, b) => a - b)
    return Math.max(60_000, (gaps[gaps.length >> 1] ?? 0) * 3)
  }, [ts])

  const bandX = Math.max(0, x(eventStart))
  const bandW = Math.min(W, x(eventEnd ?? to)) - bandX
  const markX = markAt != null && markAt >= from && markAt <= to ? x(markAt) : null
  const hoverT = hover != null ? ts[hover] : null
  const hoverPct = hoverT != null ? ((hoverT - from) / span) * 100 : null
  const axis = ticks(from, to)

  function track(e: React.PointerEvent<HTMLDivElement>) {
    if (ts.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setHover(nearest(ts, from + frac * span))
  }

  return (
    <div>
      {lanes.map((lane, i) => {
        const g = geometry(lane, ts, x, gapMs)
        const hoverV = hover != null ? lane.values[hover] : null
        return (
          <div key={lane.key} className={`py-3.5 sm:flex sm:items-center sm:gap-4 ${i > 0 ? 'border-t border-air-line' : ''}`}>
            <div className="flex items-baseline justify-between gap-3 sm:block sm:w-[150px] sm:shrink-0">
              <div>
                <p className="text-xs text-zinc-400">{lane.label}</p>
                {lane.headline != null && (
                  <p className="mt-0.5 text-[22px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-zinc-50">
                    {lane.headline}
                    {lane.unit && <span className="ml-1.5 text-[13px] font-normal tracking-normal text-zinc-400">{lane.unit}</span>}
                  </p>
                )}
              </div>
              <div className="text-right sm:text-left">
                {lane.status && (
                  <p className="flex items-center justify-end gap-1.5 text-xs sm:mt-1 sm:justify-start" style={{ color: lane.status.hex ?? '#a1a1aa' }}>
                    <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 ${lane.status.good ? 'rounded-full' : 'rounded-[2px]'}`} style={{ backgroundColor: lane.status.hex ?? '#a1a1aa' }} />
                    {lane.status.word}
                  </p>
                )}
                {lane.note && <p className="mt-0.5 text-xs tabular-nums text-zinc-400 sm:mt-1">{lane.note}</p>}
              </div>
            </div>
            <div
              role="img"
              aria-label={`${lane.label} during the event${g ? `, between ${lane.format(g.lo)} and ${lane.format(g.hi)}${lane.unit ? ` ${lane.unit}` : ''}` : ', no readings'}`}
              className={`relative mt-2 min-w-0 flex-1 touch-pan-y sm:mt-0 ${lane.lead ? 'h-[120px]' : 'h-[72px]'}`}
              onPointerMove={track}
              onPointerDown={track}
              onPointerLeave={() => setHover(null)}
            >
              <svg aria-hidden="true" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                {bandW > 0 && <rect x={bandX} y={0} width={bandW} height={H} fill={bandHex} fillOpacity={0.08} />}
                <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="#27272a" vectorEffect="non-scaling-stroke" />
                {g && lane.lines?.filter(l => l.value > g.lo && l.value < g.hi).map(l => (
                  <line key={l.value} x1={0} x2={W} y1={g.y(l.value)} y2={g.y(l.value)} stroke={l.hex} strokeOpacity={0.65} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                ))}
                {markX != null && <line x1={markX} x2={markX} y1={0} y2={H} stroke="#a1a1aa" strokeOpacity={0.45} vectorEffect="non-scaling-stroke" />}
                {g && <path d={g.path} fill="none" stroke={lane.lead ? '#fafafa' : '#d4d4d8'} strokeWidth={lane.lead ? 2 : 1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
                {hoverT != null && <line x1={x(hoverT)} x2={x(hoverT)} y1={0} y2={H} stroke="#34d399" strokeOpacity={0.8} vectorEffect="non-scaling-stroke" />}
              </svg>
              {g && lane.lines?.filter(l => l.value > g.lo && l.value < g.hi).map(l => (
                <span key={l.value} className="pointer-events-none absolute right-1 -translate-y-full whitespace-nowrap pb-0.5 text-[11px]" style={{ top: `${g.y(l.value)}%`, color: l.hex }}>
                  {l.label}
                </span>
              ))}
              {!g && <span className="absolute inset-0 grid place-items-center text-xs text-zinc-400">No readings</span>}
              {hoverPct != null && hoverV != null && (
                <span
                  className="pointer-events-none absolute top-0 whitespace-nowrap rounded-md bg-air-active px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white"
                  style={hoverPct > 70 ? { right: `${100 - hoverPct}%`, marginRight: 6 } : { left: `${hoverPct}%`, marginLeft: 6 }}
                >
                  {lane.format(hoverV)}{lane.unit ? ` ${lane.unit}` : ''}
                </span>
              )}
            </div>
          </div>
        )
      })}

      <div className="sm:flex sm:gap-4">
        <span className="hidden w-[150px] shrink-0 sm:block" />
        <div aria-hidden="true" className="relative h-5 min-w-0 flex-1 text-[11px] tabular-nums text-zinc-400">
          {hoverPct != null && hoverT != null ? (
            <span
              className="absolute top-0.5 whitespace-nowrap font-medium text-emerald-300"
              style={{ left: `${hoverPct}%`, transform: hoverPct > 88 ? 'translateX(-100%)' : hoverPct < 12 ? undefined : 'translateX(-50%)' }}
            >
              {fmtClock(hoverT)}
            </span>
          ) : axis.map(tick => {
            const pct = ((tick.t - from) / span) * 100
            return (
              <span
                key={tick.t}
                className="absolute top-0.5 whitespace-nowrap"
                style={{ left: `${pct}%`, transform: pct > 92 ? 'translateX(-100%)' : pct < 8 ? undefined : 'translateX(-50%)' }}
              >
                {tick.label}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
