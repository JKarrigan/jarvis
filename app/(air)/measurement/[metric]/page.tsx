'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { METRICS, metricValue } from '@/lib/metrics'
import { STATUS_COLORS } from '@/lib/statusColors'
import { Card, EmptyState, Page, PageHeader, PageState, SectionTitle, Segmented, Spinner, StatusDot, cardCls } from '@/app/_components/air/ui'
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

const TEMP_UNITS = [{ key: 'C', label: '°C' }, { key: 'F', label: '°F' }] as const

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
      <PageState>
        <p className="text-sm text-zinc-300">Unknown metric</p>
        <Link href="/air-quality" className="text-sm text-zinc-400 transition-colors hover:text-white">Back to Air quality</Link>
      </PageState>
    )
  }

  const unit = config.isTempLike ? `°${tempUnit}` : config.unit
  const { decimals, description } = config
  const currentStatus = stats ? statusFn(stats.latest) : null
  const fmtStat = (v: number | undefined) => (v !== undefined ? v.toFixed(decimals) : null)

  const statRows: { label: string; value: string | null }[] = [
    { label: 'Latest',  value: fmtStat(stats?.latest) },
    { label: 'Average', value: fmtStat(stats?.avg) },
    { label: 'Lowest',  value: fmtStat(stats?.min) },
    { label: 'Highest', value: fmtStat(stats?.max) },
  ]

  return (
    <Page>
      <PageHeader title={config.label} subtitle={description.what} back={{ href: '/air-quality', label: 'Air quality' }}>
        {config.isTempLike && (
          <Segmented options={TEMP_UNITS} value={tempUnit} onChange={setTempUnit} label="Temperature unit" />
        )}
      </PageHeader>

      {/* The other metrics, one tap away (they are no longer in the sidebar). */}
      <nav aria-label="Metrics" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {METRICS.map(m => {
          const active = m.slug === config.slug
          return (
            <Link
              key={m.slug}
              href={`/measurement/${m.slug}`}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                active ? 'border-transparent bg-zinc-100 font-semibold text-zinc-950' : 'border-air-line bg-air-raised text-zinc-300 hover:text-white'
              }`}
            >
              {m.label}
            </Link>
          )
        })}
      </nav>

      <section aria-label="Statistics for this range" className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {statRows.map((s, i) => (
          <div key={s.label} className={`${cardCls} flex flex-col gap-2 px-4 py-4 md:px-5`}>
            <p className="text-sm text-zinc-400">{s.label}</p>
            <p className="flex items-baseline gap-1.5">
              <span className="text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-zinc-50 md:text-4xl">
                {loading ? '—' : (s.value ?? '—')}
              </span>
              <span className="text-sm text-zinc-400">{unit}</span>
            </p>
            {i === 0 && currentStatus && !loading && (
              <p className={`flex items-center gap-2 text-sm font-medium ${STATUS_COLORS[currentStatus].textClass}`}>
                <StatusDot status={currentStatus} />
                {description.ranges.find(r => r.color === currentStatus)?.label ?? STATUS_COLORS[currentStatus].label}
              </p>
            )}
          </div>
        ))}
      </section>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <SectionTitle className="text-lg">History</SectionTitle>
        <Segmented options={RANGES} value={range} onChange={setRange} label="History range" />
      </div>

      {loading ? (
        <div className={`${cardCls} flex h-48 items-center justify-center`}><Spinner className="h-5 w-5" /></div>
      ) : values.length < 2 ? (
        <EmptyState title="No data for this period" />
      ) : (
        <Chart
          label={config.label}
          unit={unit}
          values={values}
          timestamps={timestamps}
          status={currentStatus ?? 'good'}
          statusFn={statusFn}
        />
      )}

      <Card className="mt-2 grid gap-x-10 gap-y-6 px-5 py-6 md:px-7 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-3">
          <SectionTitle>About {config.label}</SectionTitle>
          <p className="text-sm leading-relaxed text-zinc-300">{description.significance}</p>
          <p className="text-sm leading-relaxed text-zinc-400">{description.method}</p>
        </div>
        <div className="flex flex-col gap-3">
          <SectionTitle>Reference ranges</SectionTitle>
          <ul className="flex flex-col">
            {description.ranges.map(r => {
              const here = !loading && currentStatus === r.color
              return (
                <li key={r.label} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${here ? 'bg-white/[0.06]' : ''}`}>
                  <StatusDot status={r.color} />
                  <span className={here ? 'font-semibold text-zinc-50' : 'text-zinc-200'}>{r.label}</span>
                  <span className="ml-auto text-right text-zinc-400">{r.range}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </Card>
    </Page>
  )
}
