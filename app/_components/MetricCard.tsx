'use client'

import type { StatusColor } from '@/lib/types'
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

const borderClass: Record<StatusColor, string> = {
  good:            'border-emerald-400/20',
  moderate:        'border-yellow-400/20',
  sensitive:       'border-orange-400/20',
  unhealthy:       'border-red-500/20',
  'very-unhealthy':'border-purple-500/20',
  hazardous:       'border-rose-900/40',
}

const valueClass: Record<StatusColor, string> = {
  good:            'text-emerald-400',
  moderate:        'text-yellow-400',
  sensitive:       'text-orange-400',
  unhealthy:       'text-red-500',
  'very-unhealthy':'text-purple-500',
  hazardous:       'text-rose-400',
}

interface MetricCardProps {
  label: string
  value: number | string
  unit: string
  status: StatusColor
  history: number[]
  description?: string
}

export function MetricCard({ label, value, unit, status, history, description }: MetricCardProps) {
  const trend = getTrend(history)
  return (
    <div className={`flex flex-col rounded-xl border bg-zinc-900/60 overflow-hidden ${borderClass[status]}`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</span>
        <span className="text-xs text-zinc-400" aria-label={trendLabel[trend]}>{trendChar[trend]}</span>
      </div>
      <div className="px-4 pb-1">
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-bold tabular-nums leading-none ${valueClass[status]}`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          <span className="text-sm text-zinc-500">{unit}</span>
        </div>
        {description && (
          <p className="mt-1 text-xs text-zinc-600">{description}</p>
        )}
      </div>
      <div className="mt-auto w-full">
        <Sparkline values={history} status={status} width={300} height={44} />
      </div>
    </div>
  )
}
