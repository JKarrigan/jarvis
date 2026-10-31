import { deleteAlbum, getAlbum, getPhotoRow, photoInAlbum, updateAlbum } from '@/lib/photos/db'
import { isId, jsonError, parseName, readJsonObject } from '@/lib/photos/http'
import { markCatalogDirty } from '@/lib/photos/catalog'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/photos/albums/[id] — the album (items come from /api/photos?album=<id>).
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params
  if (!isId(id)) return jsonError(400, 'Invalid id')
  const album = getAlbum(id)
  if (!album) return jsonError(404, 'Not found')
  return Response.json(album, { headers: { 'Cache-Control': 'no-store' } })
}

// PATCH /api/photos/albums/[id] — { name?, coverId?: id | null }
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params
  if (!isId(id)) return jsonError(400, 'Invalid id')
  const body = await readJsonObject(request)
  if (!body) return jsonError(400, 'Invalid JSON body')
  const allowed = new Set(['name', 'coverId'])
  if (Object.keys(body).some(k => !allowed.has(k)) || Object.keys(body).length === 0) {
    return jsonError(400, 'Body may contain only name and coverId')
  }
  if (!getAlbum(id)) return jsonError(404, 'Not found')

  const patch: { name?: string; coverId?: string | null } = {}
  if (body.name !== undefined) {
    const name = parseName(body.name)
    if (!name) return jsonError(400, 'name must be 1–200 characters')
    patch.name = name
  }
  if (body.coverId !== undefined) {
    if (body.coverId === null) patch.coverId = null
    else if (!isId(body.coverId)) return jsonError(400, 'Invalid coverId')
    else {
      const row = getPhotoRow(body.coverId)
      if (!row || row.trashed_at != null || !photoInAlbum(id, body.coverId)) {
        return jsonError(400, 'coverId must be a photo in this album')
      }
      patch.coverId = body.coverId
    }
  }
  updateAlbum(id, patch)
  markCatalogDirty()
  return Response.json(getAlbum(id))
}

// DELETE /api/photos/albums/[id] — removes the album only; photos stay in the library.
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params
  if (!isId(id)) return jsonError(400, 'Invalid id')
  if (!deleteAlbum(id)) return jsonError(404, 'Not found')
  markCatalogDirty()
  return Response.json({ ok: true })
}
