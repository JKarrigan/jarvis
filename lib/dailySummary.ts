import 'server-only'
import { getPmRollups, ROLLUP_MS, type PmRollupRow } from './db'
import { aqiToColor, computeAqi } from './aqi'
import type { DailySummary } from './types'

const DAY_MS = 24 * 60 * 60 * 1000
export const DAILY_WINDOW_MS = 30 * DAY_MS
/** The poller's spacing: a rollup row of n readings stands for n × this, at most its own five minutes. */
const NOMINAL_SAMPLE_MS = 10_000
/** Day keys are memoised per 15-minute slot (every IANA offset is a multiple of 15 min). */
const SLOT_MS = 15 * 60 * 1000

export function resolveTimeZone(raw: string | null): string {
  if (raw && raw.length <= 64) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: raw }).resolvedOptions().timeZone
    } catch { /* invalid zone → server default */ }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function dayKeyFn(timeZone: string): (ts: number) => string {
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

export interface DayAcc { date: string; firstBucket: number; aqiSum: number; n: number; peakAqi: number; peakTime: number; aboveMs: number }

/**
 * Groups five-minute rollup rows (oldest first) into local days. Per row the
 * PM2.5 average gives the AQI that is averaged (weighted by readings) and that
 * counts towards time above AQI 50; the row's PM2.5 maximum gives the peak.
 * A five-minute bucket never straddles a local midnight.
 */
export function summarizeDays(rows: PmRollupRow[], dayKey: (ts: number) => string): DayAcc[] {
  const days: DayAcc[] = []
  for (const r of rows) {
    if (typeof r.avg !== 'number' || !Number.isFinite(r.avg) || !(r.n > 0)) continue
    const date = dayKey(r.bucket)
    let acc = days[days.length - 1]
    if (!acc || acc.date !== date) {
      acc = { date, firstBucket: r.bucket, aqiSum: 0, n: 0, peakAqi: -1, peakTime: r.t, aboveMs: 0 }
      days.push(acc)
    }
    const aqi = computeAqi(r.avg).value
    acc.aqiSum += aqi * r.n
    acc.n += r.n
    const peak = computeAqi(typeof r.max === 'number' && Number.isFinite(r.max) ? r.max : r.avg).value
    if (peak > acc.peakAqi) { acc.peakAqi = peak; acc.peakTime = r.t }
    if (aqi > 50) acc.aboveMs += Math.min(r.n * NOMINAL_SAMPLE_MS, ROLLUP_MS)
  }
  return days
}

export function toSummary(a: DayAcc): DailySummary {
  const avgAqi = Math.round(a.aqiSum / a.n)
  return {
    date: a.date,
    avgAqi,
    peakAqi: a.peakAqi,
    peakTime: a.peakTime,
    hoursAbove: Math.round(a.aboveMs / 360_000) / 10,
    color: aqiToColor(avgAqi),
  }
}

/**
 * Per time zone: finished days never change, so they are cached; only the
 * newest ("open") day is recomputed, starting from its first bucket.
 */
interface TzCache {
  done: Map<string, DailySummary>
  openFrom: number | null
}
const g = globalThis as typeof globalThis & { __ag_daily5m?: Map<string, TzCache> }

/**
 * One entry per local day for the last 30 days, from `readings_5m`. The open
 * day lags by up to ~6 minutes (rollups are written for complete buckets).
 */
export function getDailySummaries(timeZone: string, now = Date.now()): DailySummary[] {
  const caches = (g.__ag_daily5m ??= new Map())
  const windowStart = now - DAILY_WINDOW_MS
  let cache = caches.get(timeZone)
  if (!cache) {
    cache = { done: new Map(), openFrom: null }
    caches.set(timeZone, cache)
  }

  const dayKey = dayKeyFn(timeZone)
  const days = summarizeDays(getPmRollups(Math.max(windowStart, cache.openFrom ?? windowStart)), dayKey)

  // Every day but the newest is finished (rollups are written oldest first).
  for (let i = 0; i < days.length - 1; i++) cache.done.set(days[i].date, toSummary(days[i]))
  const open = days[days.length - 1]
  if (open) cache.openFrom = open.firstBucket

  // Forget days that fell out of the 30-day window.
  const oldest = dayKey(windowStart)
  for (const date of cache.done.keys()) if (date < oldest) cache.done.delete(date)

  const summaries = [...cache.done.values()].filter(s => s.date !== open?.date)
  if (open) summaries.push(toSummary(open))
  summaries.sort((a, b) => a.date.localeCompare(b.date))
  return summaries
}
