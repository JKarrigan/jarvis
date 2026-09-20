import { fetchEbookFile } from '@/lib/jellyfinBooks'

// Streams a book's PDF from Jellyfin (token attached server-side), passing Range
// through so the reader can open page 1 without downloading the whole file.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const upstream = await fetchEbookFile(id, request.headers.get('range'))
  if (!upstream) return Response.json({ error: 'Not found' }, { status: 404 })
  const headers = new Headers({ 'Content-Type': 'application/pdf', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' })
  for (const h of ['content-length', 'content-range']) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }
  return new Response(upstream.body, { status: upstream.status, headers })
}
