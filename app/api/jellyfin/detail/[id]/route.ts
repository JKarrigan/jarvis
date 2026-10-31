import { getMediaInfo, getReelDetail, getReelSimilar } from '@/lib/jellyfinServer'
import { errorResponse, invalidId, itemIdParam } from '../../_lib/request'

// Everything the detail view needs for one title: { detail, media, similar }.
// media is null for TV — a series has no single playable file (same as the TV page).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await itemIdParam(params)
  if (!id) return invalidId()
  try {
    const detail = await getReelDetail(id)
    if (!detail) return Response.json({ error: 'Not found' }, { status: 404 })
    const [media, similar] = await Promise.all([
      detail.type === 'movie' ? getMediaInfo(id) : Promise.resolve(null),
      getReelSimilar(id),
    ])
    return Response.json({ detail, media, similar })
  } catch (e) {
    return errorResponse(e)
  }
}
