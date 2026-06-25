import { deleteCollection } from '@/lib/jellyfinServer'

// DELETE: remove an entire collection.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ok = await deleteCollection(id)
  if (!ok) return Response.json({ error: 'Could not delete collection' }, { status: 502 })
  return new Response(null, { status: 204 })
}
