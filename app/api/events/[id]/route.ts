import { acknowledgeEventInDb, getEventById, getHistory } from '@/lib/db'
import { assertSameOrigin, readJson } from '@/lib/http'

const CONTEXT_MS = 15 * 60 * 1000 // 15 min padding either side
const MAX_SPAN_MS = 30 * 24 * 60 * 60 * 1000

function validId(id: string): boolean {
  return id.length > 0 && id.length <= 200
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!validId(id)) return Response.json({ error: 'Not found' }, { status: 404 })
  const event = getEventById(id)
  if (!event) return Response.json({ error: 'Not found' }, { status: 404 })

  const to = (event.endTime?.getTime() ?? Date.now()) + CONTEXT_MS
  const from = Math.max(event.startTime.getTime() - CONTEXT_MS, to - MAX_SPAN_MS)
  // Long events come back downsampled (≤ ~800 points), like /api/history.
  const readings = getHistory(from, to)

  return Response.json({ event, readings })
}

/** PATCH /api/events/:id  { acknowledged: true } */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected
  const { id } = await params
  if (!validId(id)) return Response.json({ error: 'Not found' }, { status: 404 })
  const body = await readJson<{ acknowledged?: unknown }>(request, 4096)
  if (!body || body.acknowledged !== true) return Response.json({ error: 'invalid body' }, { status: 400 })
  if (!acknowledgeEventInDb(id)) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ ok: true })
}
