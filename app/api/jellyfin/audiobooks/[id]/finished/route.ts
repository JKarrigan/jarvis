import { assertSameOrigin } from '@/lib/http'
import { setAudiobookFinished } from '@/lib/jellyfinAudiobooks'
import { invalidId, itemIdParam } from '../../../_lib/request'

type Ctx = { params: Promise<{ id: string }> }

// POST marks the book finished; DELETE marks it unplayed, which also clears the
// resume position ("Start over").
async function handle(request: Request, { params }: Ctx, finished: boolean) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const id = await itemIdParam(params)
  if (!id) return invalidId()
  const ok = await setAudiobookFinished(id, finished)
  return Response.json({ ok }, { status: ok ? 200 : 502 })
}

export const POST = (request: Request, ctx: Ctx) => handle(request, ctx, true)
export const DELETE = (request: Request, ctx: Ctx) => handle(request, ctx, false)
