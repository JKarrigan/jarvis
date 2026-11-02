import { assertSameOrigin, readJson } from '@/lib/http'
import { reopenAudiobook, setAudiobookFinished } from '@/lib/jellyfinAudiobooks'
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

// PATCH { position } un-finishes the book but keeps `position` as its resume point:
// the player sends it when a book Jellyfin flagged as played starts playing again,
// so the flag can't stick and swallow every later saved position.
export async function PATCH(request: Request, { params }: Ctx) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const id = await itemIdParam(params)
  if (!id) return invalidId()
  const body = await readJson<{ position?: unknown }>(request, 1024)
  const position = body?.position
  if (typeof position !== 'number' || !Number.isFinite(position) || position < 0) {
    return Response.json({ error: 'position must be a non-negative number of seconds' }, { status: 400 })
  }
  const ok = await reopenAudiobook(id, position)
  return Response.json({ ok }, { status: ok ? 200 : 502 })
}
