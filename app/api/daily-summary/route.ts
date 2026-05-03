import { getReadingsByDateRange } from '@/lib/db'
import { computeAqi, aqiToColor } from '@/lib/aqi'
import type { DailySummary } from '@/lib/types'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function toLocalDateString(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET() {
  const now = Date.now()
  const readings = getReadingsByDateRange(now - THIRTY_DAYS_MS, now)

  const byDay = new Map<string, { aqis: number[]; timestamps: number[] }>()
  for (const entry of readings) {
    const date = toLocalDateString(entry.timestamp)
    if (!byDay.has(date)) byDay.set(date, { aqis: [], timestamps: [] })
    const aqi = computeAqi(entry.measures.pm02).value
    byDay.get(date)!.aqis.push(aqi)
    byDay.get(date)!.timestamps.push(entry.timestamp)
  }

  const summaries: DailySummary[] = []
  for (const [date, { aqis, timestamps }] of byDay) {
    const avgAqi = Math.round(aqis.reduce((a, b) => a + b, 0) / aqis.length)

    let peakAqi = 0
    let peakTime = timestamps[0]
    for (let i = 0; i < aqis.length; i++) {
      if (aqis[i] > peakAqi) {
        peakAqi = aqis[i]
        peakTime = timestamps[i]
      }
    }

    // Each reading covers ~10s; convert count to hours
    const hoursAbove = Math.round((aqis.filter(a => a > 50).length * 10) / 3600 * 10) / 10

    summaries.push({ date, avgAqi, peakAqi, peakTime, hoursAbove, color: aqiToColor(avgAqi) })
  }

  summaries.sort((a, b) => a.date.localeCompare(b.date))
  return Response.json(summaries)
}
