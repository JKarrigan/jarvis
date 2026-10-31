import { acknowledgeEventInDb, getEvents } from '@/lib/db'
import { assertSameOrigin, intParam, readJson } from '@/lib/http'

/**
 * Events are detected on the server by the poller (lib/poller.ts); clients
 * only read them and acknowledge them.
 *
 * GET /api/events?limit=200&since=<ms>&active=1
 *   since  → events that started at/after `since` or were still running then
 *   active → only events that are still open
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const limit = intParam(params.get('limit'), { def: 200, min: 1, max: 1000 })
  const sinceRaw = params.get('since')
  const since = sinceRaw != null ? intParam(sinceRaw, { def: 0, min: 0 }) : undefined
  const activeOnly = params.get('active') === '1'
  return Response.json(getEvents({ limit, since, activeOnly }))
}

function acknowledge(id: unknown): Response {
  if (typeof id !== 'string' || id.length === 0 || id.length > 200) {
    return Response.json({ error: 'invalid id' }, { status: 400 })
  }
  if (!acknowledgeEventInDb(id)) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ ok: true })
}

/** PATCH /api/events  { id, acknowledged: true } */
export async function PATCH(request: Request) {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected
  const body = await readJson<{ id?: unknown; acknowledged?: unknown }>(request, 4096)
  if (!body || body.acknowledged !== true) return Response.json({ error: 'invalid body' }, { status: 400 })
  return acknowledge(body.id)
}

/** Legacy: POST /api/events { acknowledgeId }. Event bodies are no longer accepted from clients. */
export async function POST(request: Request) {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected
  const body = await readJson<{ acknowledgeId?: unknown }>(request, 4096)
  if (!body || body.acknowledgeId === undefined) return Response.json({ error: 'invalid body' }, { status: 400 })
  return acknowledge(body.acknowledgeId)
}
