'use client'

import { memo } from 'react'
import { useNowSecond } from '@/lib/useNow'

function fmtAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 90) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 90) return `${m} min`
  return `${(m / 60).toFixed(1)} h`
}

function Age({ since }: { since: number }) {
  const now = useNowSecond()
  return <>{now != null ? fmtAge(now - since) : '…'}</>
}

/**
 * Shown when the newest reading is old or the server reports a polling error,
 * so a frozen dashboard is never mistaken for live data.
 */
export const StaleBanner = memo(function StaleBanner({ lastUpdated, error, stale }: {
  lastUpdated: Date | null
  error: string | null
  stale: boolean
}) {
  if (!stale && !error) return null
  return (
    <div role="status" className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200 flex items-center gap-2 flex-wrap">
      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" aria-hidden="true" />
      <span className="font-semibold">{stale ? 'Data is not updating' : 'Sensor problem'}</span>
      {error && <span className="text-amber-300/90">{error}</span>}
      {lastUpdated && (
        <span className="text-amber-300/80">· last reading <Age since={lastUpdated.getTime()} /> ago</span>
      )}
    </div>
  )
})
