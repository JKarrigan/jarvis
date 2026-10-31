import { assertSameOrigin } from '@/lib/http'
import { clearResumeProgress } from '@/lib/jellyfinServer'
import { invalidId, itemIdParam } from '../../_lib/request'

// DELETE: clear an item's resume position so it leaves Continue Watching.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const id = await itemIdParam(params)
  if (!id) return invalidId()
  const ok = await clearResumeProgress(id)
  if (!ok) return Response.json({ error: 'Could not clear progress' }, { status: 502 })
  return new Response(null, { status: 204 })
}
