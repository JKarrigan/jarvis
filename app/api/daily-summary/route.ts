import { getPmSeries } from '@/lib/db'
import { computeAqi, aqiToColor } from '@/lib/aqi'
import type { DailySummary } from '@/lib/types'

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_MS = 30 * DAY_MS
/** A reading accounts for the time until the next one, capped so gaps don't count as hours. */
const MAX_SAMPLE_MS = 60_000
const NOMINAL_SAMPLE_MS = 10_000
/** Day keys are memoised per 15-minute slot (every IANA offset is a multiple of 15 min). */
const SLOT_MS = 15 * 60 * 1000

/**
 * Per time zone: finished days never change, so they are cached; only the
 * newest ("open") day is recomputed, starting from its first reading.
 */
interface TzCache {
  done: Map<string, DailySummary>
  openFrom: number | null
}
const g = globalThis as typeof globalThis & { __ag_daily?: Map<string, TzCache> }
const caches = (g.__ag_daily ??= new Map())

function resolveTimeZone(raw: string | null): string {
  if (raw && raw.length <= 64) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: raw }).resolvedOptions().timeZone
    } catch { /* invalid zone → server default */ }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

function dayKeyFn(timeZone: string): (ts: number) => string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const memo = new Map<number, string>()
  return ts => {
    const slot = Math.floor(ts / SLOT_MS)
    let key = memo.get(slot)
    if (key === undefined) {
      key = fmt.format(slot * SLOT_MS) // en-CA formats as YYYY-MM-DD
      memo.set(slot, key)
    }
    return key
  }
}

interface Acc { date: string; firstTs: number; sum: number; n: number; peakAqi: number; peakTime: number; aboveMs: number }

/**
 * GET /api/daily-summary?tz=America/Los_Angeles — one entry per local day for
 * the last 30 days. AQI uses compensated PM2.5 when the firmware reports it.
 */
export async function GET(request: Request) {
  const timeZone = resolveTimeZone(new URL(request.url).searchParams.get('tz'))
  const now = Date.now()
  const windowStart = now - WINDOW_MS

  let cache = caches.get(timeZone)
  if (!cache) {
    cache = { done: new Map(), openFrom: null }
    caches.set(timeZone, cache)
  }

  const from = Math.max(windowStart, cache.openFrom ?? windowStart)
  const rows = getPmSeries(from)
  const dayKey = dayKeyFn(timeZone)

  const days: Acc[] = []
  for (let i = 0; i < rows.length; i++) {
    const { timestamp, pm } = rows[i]
    if (typeof pm !== 'number' || !Number.isFinite(pm)) continue
    const date = dayKey(timestamp)
    let acc = days[days.length - 1]
    if (!acc || acc.date !== date) {
      acc = { date, firstTs: timestamp, sum: 0, n: 0, peakAqi: -1, peakTime: timestamp, aboveMs: 0 }
      days.push(acc)
    }
    const aqi = computeAqi(pm).value
    acc.sum += aqi
    acc.n++
    if (aqi > acc.peakAqi) { acc.peakAqi = aqi; acc.peakTime = timestamp }
    if (aqi > 50) {
      const next = rows[i + 1]?.timestamp
      acc.aboveMs += next != null ? Math.min(next - timestamp, MAX_SAMPLE_MS) : NOMINAL_SAMPLE_MS
    }
  }

  const toSummary = (a: Acc): DailySummary => {
    const avgAqi = Math.round(a.sum / a.n)
    return {
      date: a.date,
      avgAqi,
      peakAqi: a.peakAqi,
      peakTime: a.peakTime,
      hoursAbove: Math.round(a.aboveMs / 360_000) / 10,
      color: aqiToColor(avgAqi),
    }
  }

  // Every day but the newest is finished (readings arrive in time order).
  for (let i = 0; i < days.length - 1; i++) cache.done.set(days[i].date, toSummary(days[i]))
  const open = days[days.length - 1]
  if (open) cache.openFrom = open.firstTs

  // Forget days that fell out of the 30-day window.
  const oldest = dayKey(windowStart)
  for (const date of cache.done.keys()) if (date < oldest) cache.done.delete(date)

  const summaries = [...cache.done.values()]
  if (open) summaries.push(toSummary(open))
  summaries.sort((a, b) => a.date.localeCompare(b.date))
  return Response.json(summaries)
}
