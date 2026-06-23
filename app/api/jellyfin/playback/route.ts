import { getPlayback } from '@/lib/jellyfinServer'

// Resolves a playable stream URL for an item. The Jellyfin token is attached
// server-side; the client receives a ready-to-play URL (direct or HLS).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const id = params.get('id')
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })
  const forceHls = params.get('hls') === '1'
  const source = await getPlayback(id, { forceHls })
  if (!source) return Response.json({ error: 'No playable source' }, { status: 404 })
  return Response.json(source)
}
