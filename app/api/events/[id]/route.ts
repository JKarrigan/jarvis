import { getEventById, getReadingsByDateRange } from '@/lib/db'

const CONTEXT_MS = 15 * 60 * 1000 // 15 min padding either side

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const event = getEventById(id)
  if (!event) return Response.json({ error: 'Not found' }, { status: 404 })

  const from = event.startTime.getTime() - CONTEXT_MS
  const to = (event.endTime?.getTime() ?? Date.now()) + CONTEXT_MS
  const readings = getReadingsByDateRange(from, to)

  return Response.json({ event, readings })
}
