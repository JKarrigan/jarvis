import { assertSameOrigin } from '@/lib/http'
import { addAlbumItems, albumExists, getAlbum, removeAlbumItems } from '@/lib/photos/db'
import { isId, jsonError, parseIdList, readJsonObject } from '@/lib/photos/http'
import { markCatalogDirty } from '@/lib/photos/catalog'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function parse(request: Request, ctx: Ctx): Promise<{ id: string; ids: string[] } | Response> {
  const { id } = await ctx.params
  if (!isId(id)) return jsonError(400, 'Invalid id')
  const body = await readJsonObject(request)
  const ids = body ? parseIdList(body.ids) : null
  if (!ids || ids.length === 0) return jsonError(400, 'Body must be { "ids": [id, …] } (1–1000 ids)')
  if (!albumExists(id)) return jsonError(404, 'Album not found')
  return { id, ids }
}

// POST /api/photos/albums/[id]/items — { ids } → adds (unknown ids are ignored)
export async function POST(request: Request, ctx: Ctx) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const p = await parse(request, ctx)
  if (p instanceof Response) return p
  const added = addAlbumItems(p.id, p.ids)
  if (added > 0) markCatalogDirty()
  return Response.json({ added, album: getAlbum(p.id) })
}

// DELETE /api/photos/albums/[id]/items — { ids } → removes
export async function DELETE(request: Request, ctx: Ctx) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const p = await parse(request, ctx)
  if (p instanceof Response) return p
  const removed = removeAlbumItems(p.id, p.ids)
  if (removed > 0) markCatalogDirty()
  return Response.json({ removed, album: getAlbum(p.id) })
}
