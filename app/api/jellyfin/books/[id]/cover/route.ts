import { getEbook, saveEbookCover } from '@/lib/jellyfinBooks'

const MAX_BYTES = 3 * 1024 * 1024

// POST (image/jpeg body): store a client-rendered page 1 as the book's cover in
// Jellyfin. Only fills a gap — a book that already has a cover is left alone.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!request.headers.get('content-type')?.startsWith('image/jpeg')) {
    return Response.json({ error: 'Expected image/jpeg' }, { status: 415 })
  }
  const bytes = await request.arrayBuffer()
  const head = new Uint8Array(bytes.slice(0, 3))
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES || head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
    return Response.json({ error: 'Not a JPEG under 3 MB' }, { status: 400 })
  }
  const book = await getEbook(id)
  if (!book) return Response.json({ error: 'Not found' }, { status: 404 })
  if (book.coverUrl) return Response.json({ ok: true, skipped: true })
  const ok = await saveEbookCover(id, bytes)
  return Response.json({ ok }, { status: ok ? 200 : 502 })
}
