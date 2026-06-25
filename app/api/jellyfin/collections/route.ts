import { getBoxSets, createCollection } from '@/lib/jellyfinServer'

// GET: list all collections (BoxSets) with their member ids.
export async function GET() {
  const collections = await getBoxSets()
  return Response.json(collections)
}

// POST: create a collection { name, ids? } → { id }.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string; ids?: string[] }
  const name = (body.name ?? '').trim()
  if (!name) return Response.json({ error: 'Missing name' }, { status: 400 })
  const id = await createCollection(name, Array.isArray(body.ids) ? body.ids : [])
  if (!id) return Response.json({ error: 'Could not create collection' }, { status: 502 })
  return Response.json({ id })
}
