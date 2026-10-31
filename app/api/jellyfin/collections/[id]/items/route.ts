import { assertSameOrigin } from '@/lib/http'
import { addToCollection, isItemId, removeFromCollection } from '@/lib/jellyfinServer'
import { badRequest, invalidId, itemIdParam } from '../../../_lib/request'

type Ctx = { params: Promise<{ id: string }> }

// Item ids come as a comma-separated `ids` query param (we toggle one at a time).
function idsFrom(request: Request): string[] | null {
  const raw = new URL(request.url).searchParams.get('ids') ?? ''
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean)
  return ids.length > 0 && ids.length <= 200 && ids.every(isItemId) ? ids : null
}

async function handle(request: Request, { params }: Ctx, add: boolean) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const id = await itemIdParam(params)
  if (!id) return invalidId()
  const ids = idsFrom(request)
  if (!ids) return badRequest('Missing or invalid ids')
  const ok = add ? await addToCollection(id, ids) : await removeFromCollection(id, ids)
  if (!ok) return Response.json({ error: add ? 'Could not add to collection' : 'Could not remove from collection' }, { status: 502 })
  return new Response(null, { status: 204 })
}

// POST: add titles to the collection. DELETE: remove them.
export const POST = (request: Request, ctx: Ctx) => handle(request, ctx, true)
export const DELETE = (request: Request, ctx: Ctx) => handle(request, ctx, false)
