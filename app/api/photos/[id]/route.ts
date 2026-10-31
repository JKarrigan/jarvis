import { getPhotoDetail, setFavorite } from '@/lib/photos/db'
import { isId, jsonError, readJsonObject } from '@/lib/photos/http'
import { markCatalogDirty } from '@/lib/photos/catalog'
import { StoreError, deletePermanently, restorePhoto, trashPhoto } from '@/lib/photos/store'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/photos/[id] — one item with full metadata and its albums.
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params
  if (!isId(id)) return jsonError(400, 'Invalid id')
  const item = getPhotoDetail(id)
  if (!item) return jsonError(404, 'Not found')
  return Response.json(item, { headers: { 'Cache-Control': 'no-store' } })
}

// PATCH /api/photos/[id] — { favorite: boolean }
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params
  if (!isId(id)) return jsonError(400, 'Invalid id')
  const body = await readJsonObject(request)
  if (!body || typeof body.favorite !== 'boolean' || Object.keys(body).length !== 1) {
    return jsonError(400, 'Body must be { "favorite": boolean }')
  }
  if (!setFavorite(id, body.favorite)) return jsonError(404, 'Not found')
  markCatalogDirty()
  return Response.json(getPhotoDetail(id))
}

// DELETE /api/photos/[id] — move to trash; ?restore=1 restores; ?permanent=1 removes a trashed item.
export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params
  if (!isId(id)) return jsonError(400, 'Invalid id')
  const sp = new URL(request.url).searchParams
  const restore = sp.get('restore') === '1'
  const permanent = sp.get('permanent') === '1'
  if (restore && permanent) return jsonError(400, 'restore and permanent are exclusive')
  try {
    if (restore) {
      const relPath = await restorePhoto(id)
      return Response.json({ ok: true, restored: true, relPath })
    }
    if (permanent) {
      await deletePermanently(id)
      return Response.json({ ok: true, deleted: true })
    }
    await trashPhoto(id)
    return Response.json({ ok: true, trashed: true })
  } catch (e) {
    if (e instanceof StoreError) return jsonError(e.status, e.message)
    console.error('[photos] delete failed', id, e)
    return jsonError(500, 'Operation failed')
  }
}
