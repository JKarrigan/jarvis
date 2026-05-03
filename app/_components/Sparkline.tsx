'use client'

const strokeColor: Record<string, string> = {
  good:            '#34d399',
  moderate:        '#facc15',
  sensitive:       '#fb923c',
  unhealthy:       '#ef4444',
  'very-unhealthy':'#a855f7',
  hazardous:       '#9f1239',
}

interface SparklineProps {
  values: number[]
  status: string
  width?: number
  height?: number
}

export function Sparkline({ values, status, width = 200, height = 40 }: SparklineProps) {
  const vals = values.filter(Number.isFinite)

  if (vals.length < 2) {
    return <svg style={{ width: '100%', display: 'block' }} height={height} />
  }

  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const pad = (max - min) * 0.12 || 1
  const lo = min - pad
  const hi = max + pad

  const toX = (i: number) => (i / (vals.length - 1)) * width
  const toY = (v: number) => height - 1 - ((v - lo) / (hi - lo)) * (height - 2)

  const points = vals.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
  const color = strokeColor[status] ?? '#71717a'

  const areaPath = [
    `M ${toX(0)},${height}`,
    ...vals.map((v, i) => `L ${toX(i)},${toY(v)}`),
    `L ${toX(vals.length - 1)},${height}`,
    'Z',
  ].join(' ')

  return (
    <svg style={{ width: '100%', display: 'block' }} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={areaPath} fill={color} fillOpacity={0.12} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
