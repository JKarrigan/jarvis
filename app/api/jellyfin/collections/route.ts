import { assertSameOrigin } from '@/lib/http'
import { createCollection, getBoxSets, isItemId } from '@/lib/jellyfinServer'
import { TOO_LARGE, badRequest, errorResponse, readJsonCapped, tooLarge } from '../_lib/request'

const MAX_BODY = 64 * 1024

// GET: list all collections (BoxSets) with their member ids.
export async function GET() {
  try {
    return Response.json(await getBoxSets())
  } catch (e) {
    return errorResponse(e)
  }
}

// POST: create a collection { name, ids? } → { id }.
export async function POST(request: Request) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const body = await readJsonCapped<{ name?: unknown; ids?: unknown }>(request, MAX_BODY)
  if (body === TOO_LARGE) return tooLarge(MAX_BODY)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return badRequest('Missing name')
  const ids = Array.isArray(body?.ids) ? body.ids : []
  if (ids.length > 500 || !ids.every(isItemId)) return badRequest('Invalid ids')
  const id = await createCollection(name, ids)
  if (!id) return Response.json({ error: 'Could not create collection' }, { status: 502 })
  return Response.json({ id })
}
