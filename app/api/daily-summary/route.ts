import { getDailySummaries, resolveTimeZone } from '@/lib/dailySummary'

/**
 * GET /api/daily-summary?tz=America/Los_Angeles — one entry per local day for
 * the last 30 days, from the five-minute rollups (lib/dailySummary.ts). AQI
 * uses compensated PM2.5 when the firmware reports it.
 */
export async function GET(request: Request) {
  const timeZone = resolveTimeZone(new URL(request.url).searchParams.get('tz'))
  return Response.json(getDailySummaries(timeZone))
}
