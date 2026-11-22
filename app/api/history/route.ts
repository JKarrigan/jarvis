import { getHistory, getRecentMinutes, getRecentReadings } from '@/lib/db'
import { intParam } from '@/lib/http'

const DEFAULT_LIMIT = 3600     // 10 h at 10 s polling
const MAX_LIMIT = 8640         // 24 h at 10 s polling
const DEFAULT_MINUTES = 600
const MAX_MINUTES = 1440
const DAY_MS = 24 * 60 * 60 * 1000
/** How long the five-minute rollups are kept (raw readings: 30 days). */
const MAX_SPAN_MS = 400 * DAY_MS

/**
 * GET /api/history?from=&to=  → readings in [from, to] (Unix ms). The span is
 *   clamped to 400 days; spans over 6 h are averaged server-side to ≤ ~800
 *   points with per-bucket min / max (see getHistory: raw readings below
 *   five-minute buckets, the `readings_5m` rollups above). Either bound may
 *   be omitted: `to` defaults to now, `from` to 24 h before `to`.
 * GET /api/history?minutes=N  → the last N minutes (1 … 1440) up to the newest
 *   reading as one-minute averages; each timestamp is the minute's last
 *   reading (see getRecentMinutes). What the dashboards hydrate from.
 * GET /api/history?limit=N    → the N most recent raw readings (1 … 8640).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const fromRaw = params.get('from')
  const toRaw = params.get('to')

  if (fromRaw != null || toRaw != null) {
    const to = intParam(toRaw, { def: Date.now(), min: 0 })
    let from = intParam(fromRaw, { def: to - DAY_MS, min: 0, max: to })
    if (to - from > MAX_SPAN_MS) from = to - MAX_SPAN_MS
    return Response.json(getHistory(from, to))
  }

  if (params.has('minutes')) {
    const minutes = intParam(params.get('minutes'), { def: DEFAULT_MINUTES, min: 1, max: MAX_MINUTES })
    return Response.json(getRecentMinutes(minutes))
  }

  const limit = intParam(params.get('limit'), { def: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT })
  return Response.json(getRecentReadings(limit))
}
