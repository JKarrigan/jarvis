import { assertSameOrigin } from '@/lib/http'
import { getScanStatusLive, requestScan } from '@/lib/photos/scan'

export const dynamic = 'force-dynamic'

// GET /api/photos/scan — current/last scan status (incl. libraryOnline).
export async function GET() {
  return Response.json(await getScanStatusLive(), { headers: { 'Cache-Control': 'no-store' } })
}

// POST /api/photos/scan — start a scan (or queue one follow-up if running). Returns 202 + status.
export async function POST(request: Request) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  requestScan()
  return Response.json(await getScanStatusLive(), { status: 202 })
}
