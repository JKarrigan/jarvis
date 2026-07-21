import { getPlayback, stopEncoding } from '@/lib/jellyfinServer'

// Resolves a playable stream URL for an item. The Jellyfin token is attached
// server-side; the client receives a ready-to-play URL (direct or HLS).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const id = params.get('id')
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })
  const forceHls = params.get('hls') === '1'
  const mediaSourceId = params.get('mediaSourceId') ?? undefined
  const audio = params.get('audio')
  const subtitle = params.get('subtitle')
  const source = await getPlayback(id, {
    forceHls,
    mediaSourceId,
    audioStreamIndex: audio != null && audio !== '' ? Number(audio) : undefined,
    subtitleStreamIndex: subtitle != null && subtitle !== '' ? Number(subtitle) : undefined,
  })
  if (!source) return Response.json({ error: 'No playable source' }, { status: 404 })
  return Response.json(source)
}

// Kills the server-side transcode for a play session without touching watch state.
// Used by the detail-page hover preview so an ambient stream never leaves ffmpeg
// running on the NAS after the pointer moves away.
export async function DELETE(request: Request) {
  const playSessionId = new URL(request.url).searchParams.get('playSessionId')
  if (!playSessionId) return Response.json({ error: 'Missing playSessionId' }, { status: 400 })
  await stopEncoding(playSessionId)
  return Response.json({ ok: true })
}
