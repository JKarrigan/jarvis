import { deleteCollection, renameCollection } from '@/lib/jellyfinServer'

// PATCH: rename a collection.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { name } = (await request.json().catch(() => ({}))) as { name?: string }
  if (!name || !name.trim()) return Response.json({ error: 'Name is required' }, { status: 400 })
  const ok = await renameCollection(id, name)
  if (!ok) return Response.json({ error: 'Could not rename collection' }, { status: 502 })
  return new Response(null, { status: 204 })
}

// DELETE: remove an entire collection.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ok = await deleteCollection(id)
  if (!ok) return Response.json({ error: 'Could not delete collection' }, { status: 502 })
  return new Response(null, { status: 204 })
}
