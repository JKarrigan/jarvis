import { getLatestReading } from '@/lib/db'
import { getPollerStatus } from '@/lib/poller'

export async function GET() {
  const reading = getLatestReading()
  if (!reading) return Response.json({ error: 'No data yet' }, { status: 404 })
  const { error } = getPollerStatus()
  return Response.json({ ...reading, pollerError: error })
}
