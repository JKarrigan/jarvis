import { assertSameOrigin } from '@/lib/http'
import { deleteCollection, renameCollection } from '@/lib/jellyfinServer'
import { TOO_LARGE, badRequest, invalidId, itemIdParam, readJsonCapped, tooLarge } from '../../_lib/request'

const MAX_BODY = 8 * 1024

// PATCH: rename a collection. The server refuses anything that isn't a BoxSet.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const id = await itemIdParam(params)
  if (!id) return invalidId()
  const body = await readJsonCapped<{ name?: unknown }>(request, MAX_BODY)
  if (body === TOO_LARGE) return tooLarge(MAX_BODY)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return badRequest('Name is required')
  const ok = await renameCollection(id, name)
  if (!ok) return Response.json({ error: 'Could not rename collection' }, { status: 502 })
  return new Response(null, { status: 204 })
}

// DELETE: remove an entire collection (BoxSets only — never a movie or series).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const id = await itemIdParam(params)
  if (!id) return invalidId()
  const ok = await deleteCollection(id)
  if (!ok) return Response.json({ error: 'Could not delete collection' }, { status: 502 })
  return new Response(null, { status: 204 })
}
