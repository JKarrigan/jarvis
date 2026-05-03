import { getRecentReadings, getReadingsByDateRange, pruneOldReadings } from '@/lib/db'

const DEFAULT_LIMIT = 3600
const MAX_LIMIT = 25_920 // 30 days at 10s intervals
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  pruneOldReadings(THIRTY_DAYS_MS)

  const from = params.get('from')
  const to = params.get('to')
  if (from && to) {
    return Response.json(getReadingsByDateRange(Number(from), Number(to)))
  }

  const raw = params.get('limit')
  const limit = Math.min(raw ? parseInt(raw, 10) || DEFAULT_LIMIT : DEFAULT_LIMIT, MAX_LIMIT)
  return Response.json(getRecentReadings(limit))
}
