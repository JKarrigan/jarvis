'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { METRICS, metricValue } from '@/lib/metrics'
import { STATUS_COLORS } from '@/lib/statusColors'
import { Chart } from '@/app/_components/Chart'
import { usePolling } from '@/app/_components/PollingProvider'
import type { HistoryEntry } from '@/lib/types'

type RangeKey = '1h' | '6h' | '24h' | '7d' | '30d'

const RANGES: { key: RangeKey; label: string; ms: number }[] = [
  { key: '1h',  label: '1h',  ms: 60 * 60 * 1000 },
  { key: '6h',  label: '6h',  ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d',  label: '7d',  ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
]

function celsiusToF(c: number) {
  return c * 9 / 5 + 32
}

export default function MetricDetailPage() {
  const { metric: slug } = useParams<{ metric: string }>()
  const config = METRICS.find(m => m.slug === slug)
  const { tempUnit, setTempUnit } = usePolling()

  const [range, setRange] = useState<RangeKey>('24h')
  // Result is tagged with the request it answers, so "loading" is derived and a
  // slow response for an old range can never overwrite a newer one.
  const reqKey = `${slug}:${range}`
  const [result, setResult] = useState<{ key: string; rows: HistoryEntry[] } | null>(null)
  const loading = result?.key !== reqKey

  useEffect(() => {
    if (!config) return
    const ac = new AbortController()
    const rangeMs = RANGES.find(r => r.key === range)!.ms
    const to = Date.now()
    const from = to - rangeMs
    fetch(`/api/history?from=${from}&to=${to}`, { signal: ac.signal })
      .then(r => r.ok ? r.json() : [])
      .then(data => setResult({ key: `${config.slug}:${range}`, rows: Array.isArray(data) ? data : [] }))
      .catch(() => { if (!ac.signal.aborted) setResult({ key: `${config.slug}:${range}`, rows: [] }) })
    return () => ac.abort()
  }, [config, range])

  const isTemp = !!config?.isTempLike && tempUnit === 'F'

  // Value and timestamp kept together; compensated field preferred per row so
  // older firmware without it still shows data.
  const { values, timestamps } = useMemo(() => {
    const values: number[] = []
    const timestamps: number[] = []
    if (!config || loading || !result) return { values, timestamps }
    for (const h of result.rows) {
      const v = metricValue(h.measures, config)
      if (v === null) continue
      values.push(isTemp ? celsiusToF(v) : v)
      timestamps.push(h.timestamp)
    }
    return { values, timestamps }
  }, [config, result, loading, isTemp])

  const stats = useMemo(() => {
    if (values.length === 0) return null
    let min = Infinity
    let max = -Infinity
    let sum = 0
    for (const v of values) {
      if (v < min) min = v
      if (v > max) max = v
      sum += v
    }
    return { latest: values[values.length - 1], avg: sum / values.length, min, max }
  }, [values])

  const statusFn = useMemo(() => {
    if (!config) return undefined
    return isTemp ? (v: number) => config.statusFn((v - 32) * 5 / 9) : config.statusFn
  }, [config, isTemp])

  if (!config || !statusFn) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 text-sm">Unknown metric</p>
          <Link href="/" className="mt-3 inline-block text-xs text-zinc-500 hover:text-zinc-300 transition-colors">← Back to overview</Link>
        </div>
      </div>
    )
  }

  const unit = config.isTempLike ? `°${tempUnit}` : config.unit
  const { decimals, description } = config
  const currentStatus = stats ? statusFn(stats.latest) : 'good'
  const fmtStat = (v: number | undefined) => (v !== undefined ? `${v.toFixed(decimals)} ${unit}` : null)

  const statRows: { label: string; value: string | null }[] = [
    { label: 'Latest',  value: fmtStat(stats?.latest) },
    { label: 'Average', value: fmtStat(stats?.avg) },
    { label: 'Min',     value: fmtStat(stats?.min) },
    { label: 'Max',     value: fmtStat(stats?.max) },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-zinc-500 hover:text-zinc-400 transition-colors text-sm">←</Link>
            <h1 className="text-base font-semibold text-zinc-100 tracking-tight">{config.label}</h1>
            <span className="text-xs text-zinc-500">{unit}</span>
          </div>
          {config.isTempLike && (
            <button
              onClick={() => setTempUnit(tempUnit === 'C' ? 'F' : 'C')}
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
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Reference ranges</p>
            <div className="flex flex-wrap gap-2">
              {description.ranges.map(r => (
                <span
                  key={r.label}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${STATUS_COLORS[r.color].badgeClass}`}
                >
                  {r.label}
                  <span className="opacity-80 font-normal">{r.range}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Analytics */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statRows.map(s => (
            <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">{s.label}</p>
              <p className="text-lg font-mono font-semibold text-zinc-100">
                {loading ? <span className="text-zinc-500">—</span> : (s.value ?? '—')}
              </p>
            </div>
          ))}
        </section>

        {/* Date range filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 uppercase tracking-widest mr-1">Range</span>
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
              <p className="text-sm text-zinc-500">No data for this period</p>
            </div>
          ) : (
            <Chart
              label={config.label}
              unit={unit}
              values={values}
              timestamps={timestamps}
              status={currentStatus}
              statusFn={statusFn}
            />
          )}
        </section>
      </main>
    </div>
  )
}
