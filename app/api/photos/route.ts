import { listPhotos, parseCursor, type PhotoQuery } from '@/lib/photos/db'
import { clampInt, isId, jsonError } from '@/lib/photos/http'
import '@/lib/photos/scan' // starts the background scheduler on first import

export const dynamic = 'force-dynamic'

// GET /api/photos?cursor&limit&kind&favorite&album&year&month — timeline page, newest first.
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const q: PhotoQuery = { limit: clampInt(sp.get('limit'), 100, 1, 500) }

  const cursor = sp.get('cursor')
  if (cursor) {
    if (!parseCursor(cursor)) return jsonError(400, 'Invalid cursor')
    q.cursor = cursor
  }
  const kind = sp.get('kind')
  if (kind) {
    if (kind !== 'image' && kind !== 'video') return jsonError(400, 'kind must be image or video')
    q.kind = kind
  }
  const fav = sp.get('favorite')
  if (fav) {
    if (!['1', 'true', '0', 'false'].includes(fav)) return jsonError(400, 'Invalid favorite')
    q.favorite = fav === '1' || fav === 'true'
  }
  const album = sp.get('album')
  if (album) {
    if (!isId(album)) return jsonError(400, 'Invalid album id')
    q.album = album
  }
  const year = sp.get('year')
  const month = sp.get('month')
  if (year) {
    if (!/^\d{4}$/.test(year)) return jsonError(400, 'Invalid year')
    q.year = Number(year)
  }
  if (month) {
    if (!q.year) return jsonError(400, 'month requires year')
    if (!/^\d{1,2}$/.test(month) || Number(month) < 1 || Number(month) > 12) return jsonError(400, 'Invalid month')
    q.month = Number(month)
  }

  return Response.json(listPhotos(q), { headers: { 'Cache-Control': 'no-store' } })
}
