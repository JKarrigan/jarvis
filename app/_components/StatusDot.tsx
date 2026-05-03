import type { StatusColor } from '@/lib/types'

const colorClass: Record<StatusColor, string> = {
  good:          'bg-emerald-400',
  moderate:      'bg-yellow-400',
  sensitive:     'bg-orange-400',
  unhealthy:     'bg-red-500',
  'very-unhealthy': 'bg-purple-500',
  hazardous:     'bg-rose-900',
}

export function StatusDot({ color }: { color: StatusColor }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colorClass[color]}`} />
  )
}
