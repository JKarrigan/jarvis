import { addToCollection, removeFromCollection } from '@/lib/jellyfinServer'

// Item ids come as a comma-separated `ids` query param (we toggle one at a time).
function idsFrom(request: Request): string[] {
  const raw = new URL(request.url).searchParams.get('ids') ?? ''
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

// POST: add titles to the collection.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ids = idsFrom(request)
  if (ids.length === 0) return Response.json({ error: 'Missing ids' }, { status: 400 })
  const ok = await addToCollection(id, ids)
  if (!ok) return Response.json({ error: 'Could not add to collection' }, { status: 502 })
  return new Response(null, { status: 204 })
}

// DELETE: remove titles from the collection.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ids = idsFrom(request)
  if (ids.length === 0) return Response.json({ error: 'Missing ids' }, { status: 400 })
  const ok = await removeFromCollection(id, ids)
  if (!ok) return Response.json({ error: 'Could not remove from collection' }, { status: 502 })
  return new Response(null, { status: 204 })
}
