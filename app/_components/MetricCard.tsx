'use client'

import { memo, useMemo } from 'react'
import Link from 'next/link'
import type { StatusColor } from '@/lib/types'
import { STATUS_COLORS } from '@/lib/statusColors'
import { metricStatusLabel } from '@/lib/metrics'
import { cardCls, StatusDot } from './air/ui'
import { Sparkline } from './Sparkline'

/** The trend compares the latest value with the one about a minute earlier. */
const TREND_WINDOW_MS = 60_000
/** Minute averages are stamped with their last reading, so "a minute earlier" may be a few seconds short. */
const TREND_SLACK_MS = 5_000
const TREND_THRESHOLD = 0.02

/**
 * Time-based, so it means the same whether the points are live 10 s readings
 * or the one-minute averages a page is hydrated with. Without timestamps it
 * falls back to six points back (10 s readings).
 */
function getTrend(history: number[], timestamps?: number[]): 'up' | 'down' | 'flat' {
  let last = history.length - 1
  while (last >= 0 && !Number.isFinite(history[last])) last--
  if (last < 0) return 'flat'
  const latest = history[last]
  let baseline: number | undefined
  if (timestamps) {
    const cutoff = timestamps[last] - TREND_WINDOW_MS + TREND_SLACK_MS
    for (let i = last - 1; i >= 0; i--) {
      if (timestamps[i] <= cutoff && Number.isFinite(history[i])) { baseline = history[i]; break }
    }
  } else {
    const vals = history.filter(Number.isFinite)
    baseline = vals.length > 6 ? vals[vals.length - 7] : undefined
  }
  if (baseline === undefined || baseline === 0) return 'flat'
  const delta = (latest - baseline) / Math.abs(baseline)
  if (delta > TREND_THRESHOLD) return 'up'
  if (delta < -TREND_THRESHOLD) return 'down'
  return 'flat'
}

const TREND_WORD = { up: 'Rising', down: 'Falling', flat: 'Steady' } as const

export interface MetricReading {
  /** Metric slug: the tile links to `/measurement/<slug>`. */
  slug: string
  label: string
  /** Already formatted (`fmtReading`): the device's averages would otherwise show their decimals. */
  value: string
  unit: string
  status: StatusColor
  /** Word shown next to the value so status isn't conveyed by colour alone. Defaults to the generic label. */
  statusLabel?: string
  history: number[]
  /** Times of `history` (the sparkline and the trend are time-based when given). */
  timestamps?: number[]
}

/** One reading for a tile or strip, with the status word taken from that metric's own ranges. */
export function metricReading(
  slug: string, label: string, value: string, unit: string, status: StatusColor, history: number[], timestamps?: number[],
): MetricReading {
  return { slug, label, value, unit, status, statusLabel: metricStatusLabel(slug, status), history, timestamps }
}

/**
 * Metric tile. The number stays neutral; colour belongs to the status word, and the
 * whole tile only takes a tint when the reading has left its good range, so the one
 * thing that needs attention is the one thing that stands out.
 */
export const MetricCard = memo(function MetricCard({ slug, label, value, unit, status, statusLabel, history, timestamps, stale = false }: MetricReading & {
  /** Data is old: grey everything instead of showing a status colour. */
  stale?: boolean
}) {
  const trend = useMemo(() => getTrend(history, timestamps), [history, timestamps])
  const style = STATUS_COLORS[status]
  const tinted = !stale && status !== 'good'
  return (
    <Link
      href={`/measurement/${slug}`}
      className={`${cardCls} flex flex-col gap-2.5 px-4 py-4 transition-colors hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 md:px-5`}
      style={tinted ? { borderColor: `${style.hex}66`, backgroundColor: `${style.hex}12` } : undefined}
    >
      <div className="flex items-center justify-between gap-2 text-sm text-zinc-400">
        <span className="truncate">{label}</span>
        <span className="shrink-0">{TREND_WORD[trend]}</span>
      </div>
      {/* The number never gives way: the sparkline takes what is left (at most 96px) and hides below 40px. */}
      <div className="flex items-end gap-3">
        <div className="flex shrink-0 items-baseline gap-1.5">
          <span className={`whitespace-nowrap text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums md:text-4xl ${stale ? 'text-zinc-500' : 'text-zinc-50'}`}>
            {value}
          </span>
          <span className="whitespace-nowrap text-sm text-zinc-400">{unit}</span>
        </div>
        <div className="@container ml-auto hidden min-w-0 max-w-24 flex-1 sm:block">
          <div className="hidden @min-[40px]:block">
            <Sparkline values={history} timestamps={timestamps} status={status} muted={stale} width={120} height={32} />
          </div>
        </div>
      </div>
      <div className={`flex items-center gap-2 text-sm font-medium ${stale ? 'text-zinc-400' : style.textClass}`}>
        <StatusDot status={status} muted={stale} />
        <span className="truncate">{stale ? 'Stale' : statusLabel ?? style.label}</span>
      </div>
    </Link>
  )
})

/**
 * The same readings as one hairline-ruled strip (Overview): big numbers, no boxes.
 * A reading outside its good range colours its own number.
 */
export const MetricStrip = memo(function MetricStrip({ items, stale = false }: { items: MetricReading[]; stale?: boolean }) {
  return (
    <section aria-label="Readings" className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-3 xl:grid-cols-6">
      {items.map(m => {
        const style = STATUS_COLORS[m.status]
        const off = !stale && m.status !== 'good'
        return (
          <Link
            key={m.slug}
            href={`/measurement/${m.slug}`}
            className="group flex min-w-0 flex-col gap-1.5 border-b border-white/10 py-4 pr-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 md:py-5"
          >
            <span className="text-[15px] text-zinc-400 transition-colors group-hover:text-zinc-200">{m.label}</span>
            <span className="flex items-baseline gap-1.5">
              <span className={`whitespace-nowrap text-[32px] font-semibold leading-none tracking-[-0.03em] tabular-nums md:text-[44px] ${stale ? 'text-zinc-500' : off ? style.textClass : 'text-zinc-50'}`}>
                {m.value}
              </span>
              <span className="whitespace-nowrap text-sm text-zinc-400">{m.unit}</span>
            </span>
            <span className={`flex items-center gap-2 text-sm ${stale ? 'text-zinc-400' : style.textClass}`}>
              <StatusDot status={m.status} muted={stale} />
              <span className="truncate">{stale ? 'Stale' : m.statusLabel ?? style.label}</span>
            </span>
          </Link>
        )
      })}
    </section>
  )
})
