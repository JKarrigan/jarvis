import { assertSameOrigin } from '@/lib/http'
import { createAlbum, getAlbum, listAlbums } from '@/lib/photos/db'
import { jsonError, parseIdList, parseName, readJsonObject } from '@/lib/photos/http'
import { markCatalogDirty } from '@/lib/photos/catalog'

export const dynamic = 'force-dynamic'

// GET /api/photos/albums — all albums, newest first.
export async function GET() {
  return Response.json({ albums: listAlbums() }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST /api/photos/albums — { name, photoIds? } → 201 Album
export async function POST(request: Request) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const body = await readJsonObject(request)
  if (!body) return jsonError(400, 'Invalid JSON body')
  const name = parseName(body.name)
  if (!name) return jsonError(400, 'name must be 1–200 characters')
  const ids = body.photoIds === undefined ? [] : parseIdList(body.photoIds)
  if (!ids) return jsonError(400, 'photoIds must be an array of ids (max 1000)')
  const id = createAlbum(name, ids)
  markCatalogDirty()
  return Response.json(getAlbum(id), { status: 201 })
}
