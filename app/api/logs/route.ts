import { getLogs } from '@/lib/httpLog'
import { intParam } from '@/lib/http'

export const dynamic = 'force-dynamic'

/** GET [?since=<id>][&limit=<n>] — newest-first log entries (same array shape as before). */
export function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sinceId = intParam(searchParams.get('since'), { def: 0, min: 0 })
  const limit = intParam(searchParams.get('limit'), { def: 500, min: 1, max: 500 })
  return Response.json(getLogs({ sinceId, limit }))
}
