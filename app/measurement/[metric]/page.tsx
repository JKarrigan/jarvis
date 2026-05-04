'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { METRICS } from '@/lib/metrics'
import { Chart } from '@/app/_components/Chart'
import type { HistoryEntry, StatusColor } from '@/lib/types'

type RangeKey = '1h' | '6h' | '24h' | '7d' | '30d'

const RANGES: { key: RangeKey; label: string; ms: number }[] = [
  { key: '1h',  label: '1h',  ms: 60 * 60 * 1000 },
  { key: '6h',  label: '6h',  ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d',  label: '7d',  ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
]

const STATUS_COLOR: Record<StatusColor, string> = {
  good:            'bg-emerald-400/20 text-emerald-400 border-emerald-400/30',
  moderate:        'bg-yellow-400/20 text-yellow-400 border-yellow-400/30',
  sensitive:       'bg-orange-400/20 text-orange-400 border-orange-400/30',
  unhealthy:       'bg-red-500/20 text-red-400 border-red-500/30',
  'very-unhealthy':'bg-purple-500/20 text-purple-400 border-purple-500/30',
  hazardous:       'bg-rose-900/40 text-rose-400 border-rose-900/50',
}

function celsiusToF(c: number) {
  return c * 9 / 5 + 32
}

export default function MetricDetailPage() {
  const { metric: slug } = useParams<{ metric: string }>()
  const config = METRICS.find(m => m.slug === slug)

  const [range, setRange] = useState<RangeKey>('24h')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('F')

  useEffect(() => {
    if (!config) return
    setLoading(true)
    const rangeMs = RANGES.find(r => r.key === range)!.ms
    const to = Date.now()
    const from = to - rangeMs
    fetch(`/api/history?from=${from}&to=${to}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setHistory(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [config, range])

  if (!config) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 text-sm">Unknown metric</p>
          <Link href="/" className="mt-3 inline-block text-xs text-zinc-600 hover:text-zinc-400 transition-colors">← Back to overview</Link>
        </div>
      </div>
    )
  }

  const key = config.altKey ?? config.key
  const isTemp = config.isTempLike && tempUnit === 'F'

  const rawValues = history.map(h => h.measures[key] as number).filter(Number.isFinite)
  const values = isTemp ? rawValues.map(celsiusToF) : rawValues
  const timestamps = history.map(h => h.timestamp)

  const unit = config.isTempLike ? `°${tempUnit}` : config.unit
  const { decimals, description } = config

  const latest = values.length > 0 ? values[values.length - 1] : null
  const avg    = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null
  const min    = values.length > 0 ? Math.min(...values) : null
  const max    = values.length > 0 ? Math.max(...values) : null

  const currentStatus = latest !== null
    ? config.statusFn(isTemp ? (latest - 32) * 5 / 9 : latest)
    : 'good'

  const stats: { label: string; value: string | null }[] = [
    { label: 'Latest',  value: latest !== null ? `${latest.toFixed(decimals)} ${unit}` : null },
    { label: 'Average', value: avg   !== null ? `${avg.toFixed(decimals)} ${unit}` : null },
    { label: 'Min',     value: min   !== null ? `${min.toFixed(decimals)} ${unit}` : null },
    { label: 'Max',     value: max   !== null ? `${max.toFixed(decimals)} ${unit}` : null },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-zinc-600 hover:text-zinc-400 transition-colors text-sm">←</Link>
            <h1 className="text-base font-semibold text-zinc-100 tracking-tight">{config.label}</h1>
            <span className="text-xs text-zinc-600">{unit}</span>
          </div>
          {config.isTempLike && (
            <button
              onClick={() => setTempUnit(u => u === 'C' ? 'F' : 'C')}
              className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors font-mono text-xs"
            >
              °C / °F
            </button>
          )}
        </div>
        {/* Description */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
          <div className="space-y-1">
            <p className="text-sm text-zinc-200 font-medium">{description.what}</p>
            <p className="text-xs text-zinc-500 leading-relaxed">{description.method}</p>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">{description.significance}</p>
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-600 mb-2">Reference ranges</p>
            <div className="flex flex-wrap gap-2">
              {description.ranges.map(r => (
                <span
                  key={r.label}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${STATUS_COLOR[r.color]}`}
                >
                  {r.label}
                  <span className="opacity-60 font-normal">{r.range}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Analytics */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">{s.label}</p>
              <p className="text-lg font-mono font-semibold text-zinc-100">
                {loading ? <span className="text-zinc-700">—</span> : (s.value ?? '—')}
              </p>
            </div>
          ))}
        </section>

        {/* Date range filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600 uppercase tracking-widest mr-1">Range</span>
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                range === r.key
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        <section>
          {loading ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 h-48 flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-emerald-500 animate-spin" />
            </div>
          ) : values.length < 2 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 h-48 flex items-center justify-center">
              <p className="text-sm text-zinc-600">No data for this period</p>
            </div>
          ) : (
            <Chart
              label={config.label}
              unit={unit}
              values={values}
              timestamps={timestamps}
              status={currentStatus}
              statusFn={isTemp ? (v: number) => config.statusFn((v - 32) * 5 / 9) : config.statusFn}
            />
          )}
        </section>
      </main>
    </div>
  )
}
