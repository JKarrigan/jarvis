import { assertSameOrigin } from '@/lib/http'
import { getPlayback, isItemId, stopEncoding } from '@/lib/jellyfinServer'
import { badRequest, errorResponse, invalidId } from '../_lib/request'

const SOURCE_ID = /^[\w-]{1,80}$/
const streamIndex = (v: string | null) => (v != null && /^\d{1,3}$/.test(v) ? Number(v) : undefined)

// Resolves a playable stream for an item. The URL returned is same-origin
// (/api/jellyfin/stream/…) with no credentials; the token is added by that proxy.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const id = params.get('id')
  if (!isItemId(id)) return invalidId()
  const mediaSourceId = params.get('mediaSourceId') || undefined
  if (mediaSourceId && !SOURCE_ID.test(mediaSourceId)) return badRequest('Invalid mediaSourceId')
  try {
    const source = await getPlayback(id, {
      forceHls: params.get('hls') === '1',
      mediaSourceId,
      audioStreamIndex: streamIndex(params.get('audio')),
      subtitleStreamIndex: streamIndex(params.get('subtitle')),
    })
    if (!source) return Response.json({ error: 'No playable source' }, { status: 404 })
    return Response.json(source, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return errorResponse(e)
  }
}

// Kills the server-side transcode for a play session without touching watch state.
// Used by the detail-page hover preview so an ambient stream never leaves ffmpeg
// running on the NAS after the pointer moves away.
export async function DELETE(request: Request) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const playSessionId = new URL(request.url).searchParams.get('playSessionId')
  if (!playSessionId || !/^[\w-]{1,64}$/.test(playSessionId)) return badRequest('Missing playSessionId')
  await stopEncoding(playSessionId)
  return Response.json({ ok: true })
}
