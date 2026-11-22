'use client'

import { memo, useMemo } from 'react'
import type { StatusColor } from '@/lib/types'
import { NEUTRAL_HEX, STATUS_COLORS } from '@/lib/statusColors'

interface SparklineProps {
  values: number[]
  /** Times of `values`: x follows time (minute averages and 10 s readings mixed). Without them, x follows the index. */
  timestamps?: number[]
  status: StatusColor
  /** Draw in neutral grey (data is stale). */
  muted?: boolean
  width?: number
  height?: number
}

export const Sparkline = memo(function Sparkline({ values, timestamps, status, muted = false, width = 200, height = 40 }: SparklineProps) {
  const paths = useMemo(() => {
    const vals: number[] = []
    const ts: number[] = []
    for (let i = 0; i < values.length; i++) {
      const t = timestamps ? timestamps[i] : i
      if (Number.isFinite(values[i]) && Number.isFinite(t)) { vals.push(values[i]); ts.push(t) }
    }
    if (vals.length < 2) return null

    // Loop instead of Math.min(...vals): spreading large arrays overflows the stack.
    let min = Infinity
    let max = -Infinity
    for (const v of vals) {
      if (v < min) min = v
      if (v > max) max = v
    }
    const pad = (max - min) * 0.12 || 1
    const lo = min - pad
    const hi = max + pad

    const t0 = ts[0]
    const span = ts[ts.length - 1] - t0 || 1
    const toX = (i: number) => ((ts[i] - t0) / span) * width
    const toY = (v: number) => height - 1 - ((v - lo) / (hi - lo)) * (height - 2)

    let line = ''
    for (let i = 0; i < vals.length; i++) line += `${i ? ' ' : ''}${toX(i).toFixed(1)},${toY(vals[i]).toFixed(1)}`
    const area = `M 0,${height} L ${line.replaceAll(' ', ' L ')} L ${width},${height} Z`
    return { line, area }
  }, [values, timestamps, width, height])

  if (!paths) {
    return <svg style={{ width: '100%', display: 'block' }} height={height} aria-hidden="true" />
  }

  const color = muted ? NEUTRAL_HEX : STATUS_COLORS[status].hex
  return (
    <svg style={{ width: '100%', display: 'block' }} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={paths.area} fill={color} fillOpacity={0.12} />
      <polyline points={paths.line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
})
