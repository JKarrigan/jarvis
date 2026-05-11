import { getEvents, upsertEvent, acknowledgeEventInDb } from '@/lib/db'
import type { AirQualityEvent } from '@/lib/eventTypes'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const limit = Math.min(parseInt(params.get('limit') ?? '200', 10), 1000)
  const since = params.get('since') ? Number(params.get('since')) : undefined
  return Response.json(getEvents(limit, since))
}

export async function POST(request: Request) {
  const body = await request.json() as { event?: AirQualityEvent; acknowledgeId?: string }

  if (body.acknowledgeId) {
    acknowledgeEventInDb(body.acknowledgeId)
    return Response.json({ ok: true })
  }

  if (body.event) {
    // Rehydrate Date objects (they arrive as ISO strings over the wire)
    const e = body.event
    upsertEvent({
      ...e,
      startTime: new Date(e.startTime),
      endTime: e.endTime ? new Date(e.endTime) : null,
    })
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'invalid body' }, { status: 400 })
}
