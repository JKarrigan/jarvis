'use client'

import { memo, useMemo } from 'react'
import type { StatusColor } from '@/lib/types'
import { NEUTRAL_HEX, STATUS_COLORS } from '@/lib/statusColors'

interface SparklineProps {
  values: number[]
  status: StatusColor
  /** Draw in neutral grey (data is stale). */
  muted?: boolean
  width?: number
  height?: number
}

export const Sparkline = memo(function Sparkline({ values, status, muted = false, width = 200, height = 40 }: SparklineProps) {
  const paths = useMemo(() => {
    const vals = values.filter(Number.isFinite)
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

    const toX = (i: number) => (i / (vals.length - 1)) * width
    const toY = (v: number) => height - 1 - ((v - lo) / (hi - lo)) * (height - 2)

    let line = ''
    for (let i = 0; i < vals.length; i++) line += `${i ? ' ' : ''}${toX(i).toFixed(1)},${toY(vals[i]).toFixed(1)}`
    const area = `M 0,${height} L ${line.replaceAll(' ', ' L ')} L ${width},${height} Z`
    return { line, area }
  }, [values, width, height])

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
