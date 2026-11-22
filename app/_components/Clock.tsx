'use client'

import { memo } from 'react'
import { useNowMinute, useNowSecond } from '@/lib/useNow'

/**
 * HH:MM with seconds; the only part of a page that re-renders every second.
 * `hero` is the wall-display clock on Overview, `inline` sits in a page header.
 */
export const Clock = memo(function Clock({ size = 'inline' }: { size?: 'inline' | 'hero' }) {
  const now = useNowSecond()
  const d = now != null ? new Date(now) : null
  const hhmm = d?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) ?? '--:--'
  const ss = d ? String(d.getSeconds()).padStart(2, '0') : '--'

  if (size === 'hero') {
    return (
      <div
        className="flex items-baseline gap-[0.06em] font-semibold leading-[0.85] tracking-[-0.05em] text-zinc-50 tabular-nums"
        style={{ fontSize: 'clamp(84px, 15vw, 200px)' }}
      >
        <span>{hhmm}</span>
        <span className="text-[0.24em] font-medium tracking-normal text-zinc-500">{ss}</span>
      </div>
    )
  }
  return (
    <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
      <span className="text-[28px] font-medium leading-none tracking-[-0.02em] text-zinc-100">{hhmm}</span>
      <span className="text-base leading-none text-zinc-400">{ss}</span>
    </div>
  )
})

/** "Saturday, November 21", refreshed once a minute. Renders a space until hydrated. */
export const DateLine = memo(function DateLine({ className = '' }: { className?: string }) {
  const now = useNowMinute()
  const d = now != null ? new Date(now) : null
  return <span className={className}>{d?.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) ?? ' '}</span>
})
