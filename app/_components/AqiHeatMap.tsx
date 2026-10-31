'use client'

import { memo, useMemo, useState } from 'react'
import type { DailySummary } from '@/lib/types'
import { STATUS_COLORS } from '@/lib/statusColors'
import { useNowMinute } from '@/lib/useNow'

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}


const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** Last 30 local days laid out in week columns (today rolls over at midnight). */
function buildWeeks(nowMs: number): (string | null)[][] {
  const days: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(nowMs)
    d.setDate(d.getDate() - i)
    days.push(toLocalDateString(d))
  }
  const [y0, m0, d0] = days[0].split('-').map(Number)
  const firstDow = new Date(y0, m0 - 1, d0).getDay()
  const cells: (string | null)[] = [...Array(firstDow).fill(null), ...days]
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7).concat(Array(7).fill(null)).slice(0, 7))
  }
  return weeks
}

export const AqiHeatMap = memo(function AqiHeatMap({ summaries }: { summaries: DailySummary[] }) {
  const [tooltip, setTooltip] = useState<{ summary: DailySummary; x: number; y: number } | null>(null)
  const nowMs = useNowMinute()
  const today = nowMs != null ? toLocalDateString(new Date(nowMs)) : null

  const summaryByDate = useMemo(() => new Map(summaries.map(s => [s.date, s])), [summaries])
  // Recomputed only when the local date changes, not every minute.
  const weeks = useMemo(() => (today ? buildWeeks(new Date(`${today}T12:00:00`).getTime()) : []), [today])
  if (weeks.length === 0) return null

  return (
    <div className="space-y-3">
      {/* Unified CSS grid: first column = day labels, remaining = week columns */}
      <div
        className="relative w-full"
        style={{
          display: 'grid',
          gridTemplateColumns: `14px repeat(${weeks.length}, 1fr)`,
          gap: '4px',
        }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Day-of-week labels (column 1, rows 1–7) */}
        {DOW_LABELS.map((label, i) => (
          <div
            key={`label-${i}`}
            style={{ gridColumn: 1, gridRow: i + 1, height: 8 }}
            className="flex items-center justify-center text-[9px] text-zinc-500 leading-none"
          >
            {i % 2 !== 0 ? label : ''}
          </div>
        ))}

        {/* Data cells (columns 2+, rows 1–7) */}
        {weeks.map((week, wi) =>
          week.map((date, di) => {
            const summary = date ? summaryByDate.get(date) : undefined
            return (
              <div
                key={`${wi}-${di}`}
                style={{
                  gridColumn: wi + 2,
                  gridRow: di + 1,
                  height: 8,
                  backgroundColor: summary
                    ? STATUS_COLORS[summary.color].hex
                    : date ? '#27272a' : 'transparent',
                }}
                className="rounded-sm cursor-default"
                title={summary ? `${formatDate(summary.date)}: average AQI ${summary.avgAqi} (${STATUS_COLORS[summary.color].label})` : undefined}
                onMouseEnter={summary ? (e) => {
                  const rect = (e.target as HTMLElement).getBoundingClientRect()
                  const parent = (e.target as HTMLElement).closest('.relative')!.getBoundingClientRect()
                  setTooltip({ summary, x: rect.left - parent.left + rect.width / 2, y: rect.top - parent.top })
                } : undefined}
              />
            )
          })
        )}

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-10 pointer-events-none -translate-x-1/2 -translate-y-full -mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs shadow-lg whitespace-nowrap"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="text-zinc-300">{formatDate(tooltip.summary.date)}</div>
            <div className="text-zinc-400 mt-0.5">
              Avg <span className="text-zinc-200">{tooltip.summary.avgAqi}</span>
              {' · '}Peak <span className="text-zinc-200">{tooltip.summary.peakAqi}</span> at {new Date(tooltip.summary.peakTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </div>
            <div className="text-zinc-500">{tooltip.summary.hoursAbove}h above Good</div>
          </div>
        )}
      </div>

    </div>
  )
})
