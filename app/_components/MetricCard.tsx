'use client'

import { memo, useMemo } from 'react'
import type { StatusColor } from '@/lib/types'
import { STATUS_COLORS } from '@/lib/statusColors'
import { Sparkline } from './Sparkline'

const TREND_WINDOW = 6
const TREND_THRESHOLD = 0.02

function getTrend(history: number[]): 'up' | 'down' | 'flat' {
  const vals = history.filter(Number.isFinite)
  if (vals.length < TREND_WINDOW + 1) return 'flat'
  const latest = vals[vals.length - 1]
  const baseline = vals[vals.length - 1 - TREND_WINDOW]
  if (baseline === 0) return 'flat'
  const delta = (latest - baseline) / Math.abs(baseline)
  if (delta > TREND_THRESHOLD) return 'up'
  if (delta < -TREND_THRESHOLD) return 'down'
  return 'flat'
}

const trendChar = { up: '↗', down: '↘', flat: '→' }
const trendLabel = { up: 'rising', down: 'falling', flat: 'stable' }

interface MetricCardProps {
  label: string
  value: number | string
  unit: string
  status: StatusColor
  /** Word shown next to the value so status isn't conveyed by colour alone. Defaults to the generic label. */
  statusLabel?: string
  history: number[]
  description?: string
  /** Data is old: grey out the value instead of showing a status colour. */
  stale?: boolean
}

export const MetricCard = memo(function MetricCard({ label, value, unit, status, statusLabel, history, description, stale = false }: MetricCardProps) {
  const trend = useMemo(() => getTrend(history), [history])
  const style = STATUS_COLORS[status]
  const word = statusLabel ?? style.label
  return (
    <div className={`flex flex-col rounded-xl border bg-zinc-900/60 overflow-hidden ${stale ? 'border-zinc-800' : style.borderClass}`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">{label}</span>
        <span className="text-xs text-zinc-400" role="img" aria-label={trendLabel[trend]} title={trendLabel[trend]}>{trendChar[trend]}</span>
      </div>
      <div className="px-4 pb-1">
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-bold tabular-nums leading-none ${stale ? 'text-zinc-500' : style.textClass}`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          <span className="text-sm text-zinc-500">{unit}</span>
        </div>
        <p className={`mt-1 text-xs font-medium truncate ${stale ? 'text-zinc-500' : style.textClass}`}>
          {stale ? 'Stale' : word}
        </p>
        {description && (
          <p className="mt-1 text-xs text-zinc-500">{description}</p>
        )}
      </div>
      <div className="mt-auto w-full">
        <Sparkline values={history} status={status} muted={stale} width={300} height={44} />
      </div>
    </div>
  )
})
