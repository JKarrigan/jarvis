import { assertSameOrigin } from '@/lib/http'
import { getEbook, saveEbookCover } from '@/lib/jellyfinBooks'
import { TOO_LARGE, errorResponse, invalidId, itemIdParam, readCapped, tooLarge } from '../../../_lib/request'

const MAX_BYTES = 3 * 1024 * 1024

// POST (image/jpeg body): store a client-rendered page 1 as the book's cover in
// Jellyfin. Only fills a gap — a book that already has a cover is left alone.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const id = await itemIdParam(params)
  if (!id) return invalidId()
  if (!request.headers.get('content-type')?.startsWith('image/jpeg')) {
    return Response.json({ error: 'Expected image/jpeg' }, { status: 415 })
  }
  // Refused by Content-Length before reading, and capped while reading.
  const bytes = await readCapped(request, MAX_BYTES)
  if (bytes === TOO_LARGE) return tooLarge(MAX_BYTES)
  if (bytes.byteLength === 0 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return Response.json({ error: 'Not a JPEG' }, { status: 400 })
  }
  try {
    const book = await getEbook(id)
    if (!book) return Response.json({ error: 'Not found' }, { status: 404 })
    if (book.coverUrl) return Response.json({ ok: true, skipped: true })
    const ok = await saveEbookCover(id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    return Response.json({ ok }, { status: ok ? 200 : 502 })
  } catch (e) {
    return errorResponse(e)
  }
}
