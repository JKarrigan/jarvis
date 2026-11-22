import {
  acknowledgeEventInDb, computeEventTrace, deleteEvent, getEventById, getEventNeighbours, getEvents, getHistory,
  getReadingSpan,
} from '@/lib/db'
import { slotOf } from '@/lib/eventDetection'
import type { AirQualityEvent } from '@/lib/eventTypes'
import { assertSameOrigin, readJson } from '@/lib/http'

const CONTEXT_MS = 15 * 60 * 1000 // 15 min padding either side
const MAX_SPAN_MS = 30 * 24 * 60 * 60 * 1000
/** How far back "this happens often" looks. */
const RECENT_MS = 14 * 24 * 60 * 60 * 1000

function validId(id: string): boolean {
  return id.length > 0 && id.length <= 200
}

function brief(e: AirQualityEvent) {
  return { id: e.id, type: e.type, severity: e.severity, startTime: e.startTime, endTime: e.endTime, peak: e.peak, baseline: e.baseline }
}

/**
 * GET /api/events/:id → the event (with its trace), the readings around it
 * when they are still stored, and what it relates to:
 *   newerId / olderId  the neighbours in the log
 *   overlapping        events of the other kind (CO₂ vs everything else) going on at the same time
 *   recent             starts of same-kind events in the 14 days before, for "this happens often"
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!validId(id)) return Response.json({ error: 'Not found' }, { status: 404 })
  const event = getEventById(id)
  if (!event) return Response.json({ error: 'Not found' }, { status: 404 })

  const now = Date.now()
  const start = event.startTime.getTime()
  const end = event.endTime?.getTime() ?? now
  const to = end + CONTEXT_MS
  const from = Math.max(start - CONTEXT_MS, to - MAX_SPAN_MS)
  // Long events come back downsampled (≤ ~800 points), like /api/history.
  // Readings that no longer reach back to the start are not a chart of the event.
  const span = getReadingSpan()
  const readings = span && span.from <= start + 5 * 60_000 ? getHistory(from, to) : []

  // A finished event has its trace saved; one still going gets a fresh one.
  if (!event.trace) event.trace = computeEventTrace(event, now)

  const slot = slotOf(event.type)
  const around = getEvents({ since: start - RECENT_MS, limit: 500 }).filter(e => e.id !== event.id)
  const overlapping = around
    .filter(e => slotOf(e.type) !== slot && e.startTime.getTime() <= end && (e.endTime?.getTime() ?? now) >= start)
    .map(brief)
  const recent = around
    .filter(e => slotOf(e.type) === slot && e.startTime.getTime() < start && e.startTime.getTime() >= start - RECENT_MS)
    .map(e => ({ id: e.id, startTime: e.startTime }))

  return Response.json({ event, readings, related: { ...getEventNeighbours(event), overlapping, recent } })
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

/** DELETE /api/events/:id → removes a finished event (409 while it is still going). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected
  const { id } = await params
  if (!validId(id)) return Response.json({ error: 'Not found' }, { status: 404 })
  const result = deleteEvent(id)
  if (result === 'missing') return Response.json({ error: 'Not found' }, { status: 404 })
  if (result === 'open') return Response.json({ error: 'Event is still going' }, { status: 409 })
  return Response.json({ ok: true })
}
