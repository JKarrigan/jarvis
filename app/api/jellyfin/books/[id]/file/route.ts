import { fetchEbookFile } from '@/lib/jellyfinBooks'
import { errorResponse, invalidId, itemIdParam } from '../../../_lib/request'

// Streams a book's PDF from Jellyfin (token attached server-side), passing Range
// through so the reader can open page 1 without downloading the whole file, and the
// client's abort signal so a closed reader stops the upstream transfer too.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await itemIdParam(params)
  if (!id) return invalidId()
  let upstream: Response | null
  try {
    upstream = await fetchEbookFile(id, request.headers.get('range'), request.signal)
  } catch (e) {
    if (request.signal.aborted) return new Response(null, { status: 499 })
    return errorResponse(e)
  }
  if (!upstream) return Response.json({ error: 'Not found' }, { status: 404 })
  const headers = new Headers({
    'Content-Type': 'application/pdf',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  })
  for (const h of ['content-length', 'content-range']) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }
  return new Response(upstream.body, { status: upstream.status, headers })
}
