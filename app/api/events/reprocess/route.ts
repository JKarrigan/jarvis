import { getAllReadings, deleteAllEvents, upsertEvent } from '@/lib/db'
import { detectEvents } from '@/lib/eventDetection'
import type { AirGradientReading } from '@/lib/eventTypes'

export async function POST() {
  const readings = getAllReadings()

  const agReadings: AirGradientReading[] = readings.map(r => ({
    timestamp: new Date(r.timestamp),
    pm01: r.measures.pm01,
    pm02: r.measures.pm02,
    pm10: r.measures.pm10,
    rco2: r.measures.rco2,
    tvocIndex: r.measures.tvocIndex,
    noxIndex: r.measures.noxIndex,
    atmp: r.measures.atmpCompensated ?? r.measures.atmp,
    rhum: r.measures.rhumCompensated ?? r.measures.rhum,
  }))

  const events = detectEvents(agReadings)

  deleteAllEvents()
  for (const event of events) {
    upsertEvent(event)
  }

  return Response.json({
    readingsProcessed: readings.length,
    eventsFound: events.length,
    span: readings.length > 0
      ? {
          from: new Date(readings[0].timestamp).toISOString(),
          to: new Date(readings[readings.length - 1].timestamp).toISOString(),
        }
      : null,
  })
}
