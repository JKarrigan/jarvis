import { assertSameOrigin } from '@/lib/http'
import { setPlayed } from '@/lib/jellyfinServer'
import { invalidId, itemIdParam } from '../../_lib/request'

type Ctx = { params: Promise<{ id: string }> }

// POST marks the item played for the dashboard user in Jellyfin; DELETE marks it
// unplayed (which also clears its resume position).
// `local: true` means there is no server to write to (mock mode) — the client keeps
// the change in its own storage.
async function handle(request: Request, { params }: Ctx, on: boolean) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const id = await itemIdParam(params)
  if (!id) return invalidId()
  const result = await setPlayed(id, on)
  if (result === 'failed') return Response.json({ ok: false }, { status: 502 })
  return Response.json({ ok: true, local: result === 'local' })
}

export const POST = (request: Request, ctx: Ctx) => handle(request, ctx, true)
export const DELETE = (request: Request, ctx: Ctx) => handle(request, ctx, false)
