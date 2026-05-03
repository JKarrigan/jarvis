import type { ComputedAqi } from '@/lib/types'

const bgClass: Record<string, string> = {
  good: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  moderate: 'bg-yellow-400/15 text-yellow-300 border-yellow-400/30',
  sensitive: 'bg-orange-400/15 text-orange-300 border-orange-400/30',
  unhealthy: 'bg-red-500/15 text-red-400 border-red-500/30',
  'very-unhealthy': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  hazardous: 'bg-rose-900/30 text-rose-300 border-rose-900/50',
}

const valueClass: Record<string, string> = {
  good: 'text-emerald-400',
  moderate: 'text-yellow-400',
  sensitive: 'text-orange-400',
  unhealthy: 'text-red-500',
  'very-unhealthy': 'text-purple-500',
  hazardous: 'text-rose-400',
}

export function AqiBadge({ aqi }: { aqi: ComputedAqi }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-7xl font-bold tabular-nums leading-none ${valueClass[aqi.color]}`}>
        {aqi.value}
      </span>
      <span className="text-xs text-zinc-500 uppercase tracking-widest font-medium">US AQI</span>
      <span className={`mt-1 px-3 py-1 rounded-full text-xs font-semibold border ${bgClass[aqi.color]}`}>
        {aqi.category}
      </span>
    </div>
  )
}
