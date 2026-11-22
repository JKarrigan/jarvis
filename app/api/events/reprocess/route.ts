import { getReadingSpan, iterateDetectorReadings, mergeDuplicateEvents, replaceEvents } from '@/lib/db'
import { runDetector } from '@/lib/eventDetection'
import { assertSameOrigin } from '@/lib/http'
import { replaceLiveDetector, scheduleTraceBackfill } from '@/lib/poller'

/**
 * Re-runs event detection over all stored readings. Detection is O(n) and the
 * rows stream straight from SQLite; the events in the span of the stored
 * readings are replaced in a single transaction that keeps acknowledgements
 * (older events, whose readings have been pruned, are kept), then rows that
 * still describe one incident twice are merged. The live poller continues
 * from the batch detector's final state, so its ids match the new rows. The
 * new rows get their traces in the background.
 */
export async function POST(request: Request) {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected

  const span = getReadingSpan()
  const { events, detector, readingsProcessed } = runDetector(iterateDetectorReadings())
  if (span) replaceEvents(events, span.from)
  mergeDuplicateEvents()
  replaceLiveDetector(detector)
  scheduleTraceBackfill(500)

  return Response.json({
    readingsProcessed,
    eventsFound: events.length,
    span: span
      ? { from: new Date(span.from).toISOString(), to: new Date(span.to).toISOString() }
      : null,
  })
}
