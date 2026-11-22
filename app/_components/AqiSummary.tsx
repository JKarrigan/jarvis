'use client'

import { memo } from 'react'
import type { StatusColor } from '@/lib/types'
import { computeAqi } from '@/lib/aqi'
import { STATUS_COLORS } from '@/lib/statusColors'
import { cardCls } from './air/ui'

/** "Cleaner than outside (34)." or null when there is no outdoor reading. */
export function outdoorLine(indoorAqi: number, outdoorAqi: number | null): string | null {
  if (outdoorAqi === null) return null
  const diff = indoorAqi - outdoorAqi
  if (diff < -2) return `Cleaner than outside (${outdoorAqi}).`
  if (diff > 2) return `Outside is cleaner (${outdoorAqi}).`
  return `About the same as outside (${outdoorAqi}).`
}

/** "TVOC is outside its good range." for the readings that are; a reassurance when none are. */
export function attentionLine(offLabels: string[]): string {
  if (offLabels.length === 0) return 'Every reading is in its good range.'
  if (offLabels.length === 1) return `${offLabels[0]} is outside its good range.`
  const head = offLabels.slice(0, -1).join(', ')
  return `${head} and ${offLabels[offLabels.length - 1]} are outside their good range.`
}

// US EPA AQI bands. `flex` compresses the two widest bands so the common end of the scale stays readable.
const SCALE: { color: StatusColor; from: number; to: number; flex: number }[] = [
  { color: 'good', from: 0, to: 50, flex: 50 },
  { color: 'moderate', from: 50, to: 100, flex: 50 },
  { color: 'sensitive', from: 100, to: 150, flex: 50 },
  { color: 'unhealthy', from: 150, to: 200, flex: 50 },
  { color: 'very-unhealthy', from: 200, to: 300, flex: 70 },
  { color: 'hazardous', from: 300, to: 500, flex: 70 },
]
const SCALE_TOTAL = SCALE.reduce((n, s) => n + s.flex, 0)

function scalePercent(aqi: number): number {
  let acc = 0
  for (let i = 0; i < SCALE.length; i++) {
    const s = SCALE[i]
    if (aqi <= s.to || i === SCALE.length - 1) {
      const within = Math.min(1, Math.max(0, (aqi - s.from) / (s.to - s.from)))
      return ((acc + within * s.flex) / SCALE_TOTAL) * 100
    }
    acc += s.flex
  }
  return 100
}

/** The AQI bands as one bar with a marker at the current value. Decorative: the number and category say the same. */
export function AqiScale({ aqi, stale = false }: { aqi: number; stale?: boolean }) {
  return (
    <div aria-hidden="true" className="relative flex h-2 gap-[3px]">
      {SCALE.map(s => {
        const here = aqi >= s.from && (aqi <= s.to || s.color === 'hazardous')
        return (
          <span
            key={s.color}
            className="rounded-full"
            style={{ flex: s.flex, backgroundColor: stale ? '#3f3f46' : STATUS_COLORS[s.color].hex, opacity: stale || here ? 1 : 0.35 }}
          />
        )
      })}
      <span className="absolute -top-[5px] h-[18px] w-1 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_2px_#111113]" style={{ left: `${scalePercent(aqi)}%` }} />
    </div>
  )
}

/** AQI summary card (Air quality page): the number, a plain sentence, and where it sits on the scale. */
export const AqiSummary = memo(function AqiSummary({ pm25, outdoorAqi, stale, className = '' }: {
  pm25: number
  outdoorAqi: number | null
  stale: boolean
  className?: string
}) {
  const aqi = computeAqi(pm25)
  const style = STATUS_COLORS[aqi.color]
  const diff = outdoorAqi === null ? null : aqi.value - outdoorAqi
  return (
    <section aria-label="Air quality index" className={`${cardCls} flex flex-wrap items-center gap-x-10 gap-y-6 px-5 py-6 md:px-8 md:py-7 ${className}`}>
      <div className="flex flex-[1_1_340px] items-center gap-5 md:gap-6">
        <span className={`text-[64px] font-bold leading-none tracking-[-0.04em] tabular-nums md:text-[88px] ${stale ? 'text-zinc-500' : style.textClass}`}>
          {aqi.value}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-xl font-semibold tracking-[-0.01em] text-zinc-50 md:text-2xl">
            {stale ? 'Last known air quality' : `Indoor air is ${aqi.category.toLowerCase()}`}
          </p>
          <p className="text-sm text-zinc-400">
            AQI from PM2.5{Number.isFinite(pm25) ? ` at ${pm25.toFixed(1)} µg/m³` : ''} · US EPA
          </p>
        </div>
      </div>
      <div className="flex flex-[1_1_280px] flex-col gap-3">
        {diff !== null && (
          <div className="flex justify-between gap-4 text-sm text-zinc-400" title="Outdoor PM2.5 AQI from Open-Meteo (CAMS model), not a local sensor">
            <span>Outdoor <strong className="font-semibold text-zinc-100">{outdoorAqi}</strong></span>
            <span>{diff === 0 ? 'Same as inside' : `${Math.abs(diff)} ${diff < 0 ? 'lower' : 'higher'} inside`}</span>
          </div>
        )}
        <AqiScale aqi={aqi.value} stale={stale} />
        <div className="flex justify-between text-xs text-zinc-400">
          <span>Good</span>
          <span>Unhealthy</span>
          <span>Hazardous</span>
        </div>
      </div>
    </section>
  )
})
