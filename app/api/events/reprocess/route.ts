import { getReadingSpan, iterateDetectorReadings, replaceAllEvents } from '@/lib/db'
import { runDetector } from '@/lib/eventDetection'
import { assertSameOrigin } from '@/lib/http'
import { replaceLiveDetector } from '@/lib/poller'

/**
 * Re-runs event detection over all stored readings. Detection is O(n) and the
 * rows stream straight from SQLite; the old events are replaced in a single
 * transaction that keeps acknowledgements. The live poller then continues from
 * the batch detector's final state, so its ids match the new rows.
 */
export async function POST(request: Request) {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected

  const span = getReadingSpan()
  const { events, detector, readingsProcessed } = runDetector(iterateDetectorReadings())
  replaceAllEvents(events)
  replaceLiveDetector(detector)

  return Response.json({
    readingsProcessed,
    eventsFound: events.length,
    span: span
      ? { from: new Date(span.from).toISOString(), to: new Date(span.to).toISOString() }
      : null,
  })
}
