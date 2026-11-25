'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { METRICS, fmtReading, metricValue } from '@/lib/metrics'
import { STATUS_COLORS } from '@/lib/statusColors'
import type { HistoryEntry, StatusColor } from '@/lib/types'
import { Card, Page, PageHeader, PageState, SectionTitle, Segmented, StatusDot, cardCls } from './air/ui'
import { Crossfade, EASE, FadeIn, LoadingMark, TweenNumber } from './air/motion'
import { Chart, ChartFrame } from './Chart'
import { usePolling } from './PollingProvider'

type RangeKey = '1h' | '6h' | '24h' | '7d' | '30d' | '90d' | '1y'

const RANGES: { key: RangeKey; label: string; ms: number }[] = [
  { key: '1h',  label: '1h',  ms: 60 * 60 * 1000 },
  { key: '6h',  label: '6h',  ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d',  label: '7d',  ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: '90d', label: '90d', ms: 90 * 24 * 60 * 60 * 1000 },
  { key: '1y',  label: '1y',  ms: 365 * 24 * 60 * 60 * 1000 },
]

const TEMP_UNITS = [{ key: 'C', label: '°C' }, { key: 'F', label: '°F' }] as const

const STAT_LABELS = ['Latest', 'Average', 'Lowest', 'Highest'] as const

function celsiusToF(c: number) {
  return c * 9 / 5 + 32
}

/**
 * One metric's page (`/measurement/<slug>`). It is rendered by the measurement
 * layout, not the page, so it stays mounted while moving between metrics: the
 * range is kept, the switcher's active pill slides, and a range or metric switch
 * never changes the size of anything. While a range loads, the last one stays on
 * screen, dimmed; when it lands the numbers count to their new values and the
 * chart cross-fades. A new metric starts from placeholders of the final size, so
 * one metric's numbers are never shown under another's name.
 */
export function MetricDetail() {
  const { metric: slug } = useParams<{ metric: string }>()
  const config = METRICS.find(m => m.slug === slug)
  const { tempUnit, setTempUnit } = usePolling()

  const [range, setRange] = useState<RangeKey>('24h')
  // Result is tagged with the request it answers, so "loading" is derived and a
  // slow response for an old range can never overwrite a newer one.
  const reqKey = `${slug}:${range}`
  const [result, setResult] = useState<{ key: string; slug: string; rows: HistoryEntry[] } | null>(null)
  const loading = result?.key !== reqKey
  // The last result for this metric stays on screen while the next range loads.
  const shown = result?.slug === slug ? result : null

  useEffect(() => {
    if (!config) return
    const ac = new AbortController()
    const rangeMs = RANGES.find(r => r.key === range)!.ms
    const to = Date.now()
    const from = to - rangeMs
    const tag = { key: `${config.slug}:${range}`, slug: config.slug }
    fetch(`/api/history?from=${from}&to=${to}`, { signal: ac.signal })
      .then(r => r.ok ? r.json() : [])
      .then(data => setResult({ ...tag, rows: Array.isArray(data) ? data : [] }))
      .catch(() => { if (!ac.signal.aborted) setResult({ ...tag, rows: [] }) })
    return () => ac.abort()
  }, [config, range])

  const isTemp = !!config?.isTempLike && tempUnit === 'F'

  // Value and timestamp kept together; compensated field preferred per row so
  // older firmware without it still shows data. Downsampled rows also carry
  // the bucket's min and max, read the same way (NaN for raw rows).
  const { values, timestamps, low, high } = useMemo(() => {
    const values: number[] = []
    const timestamps: number[] = []
    const low: number[] = []
    const high: number[] = []
    if (!config || !shown) return { values, timestamps, low, high }
    const unitOf = (v: number | null) => (v === null ? NaN : isTemp ? celsiusToF(v) : v)
    for (const h of shown.rows) {
      const v = metricValue(h.measures, config)
      if (v === null) continue
      values.push(unitOf(v))
      timestamps.push(h.timestamp)
      low.push(h.min ? unitOf(metricValue(h.min, config)) : NaN)
      high.push(h.max ? unitOf(metricValue(h.max, config)) : NaN)
    }
    return { values, timestamps, low, high }
  }, [config, shown, isTemp])

  // Lowest and highest are the true extremes when the points are averages.
  const stats = useMemo(() => {
    if (values.length === 0) return null
    let min = Infinity
    let max = -Infinity
    let sum = 0
    for (let i = 0; i < values.length; i++) {
      const v = values[i]
      const lo = Number.isFinite(low[i]) ? low[i] : v
      const hi = Number.isFinite(high[i]) ? high[i] : v
      if (lo < min) min = lo
      if (hi > max) max = hi
      sum += v
    }
    return [values[values.length - 1], sum / values.length, min, max] as const
  }, [values, low, high])

  const statusFn = useMemo(() => {
    if (!config) return undefined
    return isTemp ? (v: number) => config.statusFn((v - 32) * 5 / 9) : config.statusFn
  }, [config, isTemp])

  const decimals = config?.decimals ?? 0
  const format = useCallback((v: number) => fmtReading(v, decimals), [decimals])

  if (!config || !statusFn) {
    return (
      <PageState>
        <p className="text-sm text-zinc-300">Unknown metric</p>
        <Link href="/air-quality" className="text-sm text-zinc-400 transition-colors hover:text-white">Back to Air quality</Link>
      </PageState>
    )
  }

  const unit = config.isTempLike ? `°${tempUnit}` : config.unit
  const { description } = config
  const currentStatus: StatusColor | null = stats ? statusFn(stats[0]) : null
  // Dimmed while the next range loads over the last one.
  const dim = loading && !!shown
  const dimCls = `transition-opacity duration-200 ${dim ? 'opacity-60' : ''}`
  const statusLine = (status: StatusColor) => (
    <>
      <StatusDot status={status} />
      {description.ranges.find(r => r.color === status)?.label ?? STATUS_COLORS[status].label}
    </>
  )
  // The chart, "no data" and the placeholder share one box, so swapping them moves nothing.
  const chartState = !shown ? 'loading' : values.length < 2 ? `empty:${shown.key}` : `chart:${shown.key}`

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
              className={`relative inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                active ? 'border-transparent font-semibold text-zinc-950' : 'border-air-line bg-air-raised text-zinc-300 hover:text-white'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="metric-pill"
                  aria-hidden="true"
                  className="absolute -inset-px bg-zinc-100"
                  // Set as a style so framer-motion keeps the corners round while the pill slides.
                  style={{ borderRadius: 9999 }}
                  transition={{ duration: 0.3, ease: EASE }}
                />
              )}
              <span className="relative">{m.label}</span>
            </Link>
          )
        })}
      </nav>

      <section
        aria-label="Statistics for this range"
        aria-busy={loading}
        className={`grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4 ${dimCls}`}
      >
        {STAT_LABELS.map((label, i) => (
          <div key={label} className={`${cardCls} flex flex-col gap-2 px-4 py-4 md:px-5`}>
            <p className="text-sm text-zinc-400">{label}</p>
            <div className="flex items-baseline gap-1.5">
              {/* Keyed by metric: a new metric's numbers fade in from the placeholder, a new range's count. */}
              {stats ? (
                <FadeIn key={config.slug} className="text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-zinc-50 md:text-4xl">
                  <TweenNumber value={stats[i]} format={format} />
                </FadeIn>
              ) : (
                <span className={`text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-zinc-700 md:text-4xl ${shown ? '' : 'animate-pulse'}`}>—</span>
              )}
              <span className="text-sm text-zinc-400">{unit}</span>
            </div>
            {/* Always takes its line, so the cards are the same height with or without a status. */}
            {i === 0 && (
              currentStatus ? (
                <FadeIn key={config.slug} className={`flex items-center gap-2 text-sm font-medium ${STATUS_COLORS[currentStatus].textClass}`}>
                  {statusLine(currentStatus)}
                </FadeIn>
              ) : (
                <div aria-hidden="true" className="invisible flex items-center gap-2 text-sm font-medium">{statusLine('good')}</div>
              )
            )}
          </div>
        ))}
      </section>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <SectionTitle className="text-lg">History</SectionTitle>
          <LoadingMark loading={loading} />
        </div>
        <Segmented options={RANGES} value={range} onChange={setRange} label="History range" scroll />
      </div>

      <Crossfade id={chartState} className={dimCls}>
        {chartState.startsWith('chart:') ? (
          <Chart
            label={config.label}
            unit={unit}
            values={values}
            low={low}
            high={high}
            timestamps={timestamps}
            status={currentStatus ?? 'good'}
            statusFn={statusFn}
          />
        ) : (
          <ChartFrame label={config.label} unit={unit}>
            {chartState === 'loading'
              ? <span className="h-full w-full animate-pulse rounded-lg bg-white/[0.02]" />
              : <p className="text-sm text-zinc-300">No data for this period</p>}
          </ChartFrame>
        )}
      </Crossfade>

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
              const here = currentStatus === r.color
              return (
                <li key={r.label} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-300 ${here ? 'bg-white/[0.06]' : ''}`}>
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
