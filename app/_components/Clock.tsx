'use client'

import { memo } from 'react'
import { useNowMinute, useNowSecond } from '@/lib/useNow'

/** HH:MM with seconds; the only part of a dashboard that re-renders every second. */
export const Clock = memo(function Clock() {
  const now = useNowSecond()
  const d = now != null ? new Date(now) : null
  const hhmm = d?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) ?? '--:--'
  const ss = d ? String(d.getSeconds()).padStart(2, '0') : '--'
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-4xl font-bold tabular-nums leading-none text-zinc-100">{hhmm}</span>
      <span className="text-2xl font-bold tabular-nums leading-none text-zinc-500">{ss}</span>
    </div>
  )
})

/** Weekday and date, refreshed once a minute. */
export const DateLabel = memo(function DateLabel({ weekdayClass, dateClass }: { weekdayClass: string; dateClass: string }) {
  const now = useNowMinute()
  const d = now != null ? new Date(now) : null
  return (
    <>
      <p className={weekdayClass}>{d?.toLocaleDateString([], { weekday: 'long' }) ?? ' '}</p>
      <p className={dateClass}>{d?.toLocaleDateString([], { month: 'long', day: 'numeric' }) ?? ' '}</p>
    </>
  )
})
