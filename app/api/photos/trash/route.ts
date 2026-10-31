import { listTrash, parseCursor } from '@/lib/photos/db'
import { clampInt, jsonError } from '@/lib/photos/http'

export const dynamic = 'force-dynamic'

// GET /api/photos/trash?cursor&limit — Recently deleted, newest deletion first.
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const cursor = sp.get('cursor')
  if (cursor && !parseCursor(cursor)) return jsonError(400, 'Invalid cursor')
  const limit = clampInt(sp.get('limit'), 100, 1, 500)
  return Response.json(listTrash(cursor, limit), { headers: { 'Cache-Control': 'no-store' } })
}
