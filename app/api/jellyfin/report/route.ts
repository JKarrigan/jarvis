import { reportPlayback, type PlaybackReport } from '@/lib/jellyfinServer'

// Forwards playback progress to Jellyfin (start / progress / stopped) so the
// dashboard user's "Continue Watching" / resume position stays in sync.
export async function POST(request: Request) {
  let payload: { kind?: 'start' | 'progress' | 'stopped'; report?: PlaybackReport }
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { kind, report } = payload
  if (!kind || !report?.ItemId) {
    return Response.json({ error: 'Missing kind or report.ItemId' }, { status: 400 })
  }
  await reportPlayback(kind, report)
  return Response.json({ ok: true })
}
