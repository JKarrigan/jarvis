import { clearResumeProgress } from '@/lib/jellyfinServer'

// DELETE: clear an item's resume position so it leaves Continue Watching.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ok = await clearResumeProgress(id)
  if (!ok) return Response.json({ error: 'Could not clear progress' }, { status: 502 })
  return new Response(null, { status: 204 })
}
