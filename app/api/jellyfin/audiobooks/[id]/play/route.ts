import { getAudiobook, getAudiobookPlayback } from '@/lib/jellyfinAudiobooks'
import { errorResponse, invalidId, itemIdParam } from '../../../_lib/request'

// Everything the persistent audiobook player needs to load a book: its detail
// (chapters + current resume position) and a ready-to-play, same-origin stream URL
// (no credentials). `source` is null in mock mode — the player shows the book but
// can't play it.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await itemIdParam(params)
  if (!id) return invalidId()
  try {
    const [book, source] = await Promise.all([getAudiobook(id), getAudiobookPlayback(id).catch(() => null)])
    if (!book) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json({ book, source }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return errorResponse(e)
  }
}
