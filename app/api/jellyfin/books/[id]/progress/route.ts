import { saveEbookProgress } from '@/lib/jellyfinBooks'

// PUT: remember the page a reader is on (kept in this app's DB — Jellyfin has no
// usable reading progress for books).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: { page?: unknown; pages?: unknown; rtl?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const page = Number(body.page)
  const pages = Number(body.pages)
  if (!/^[0-9a-f]{32}$/i.test(id) || !Number.isInteger(page) || !Number.isInteger(pages) || page < 1 || pages < 1 || page > pages || pages > 100_000) {
    return Response.json({ error: 'Invalid progress' }, { status: 400 })
  }
  saveEbookProgress(id, { page, pages, rtl: body.rtl === true })
  return Response.json({ ok: true })
}
