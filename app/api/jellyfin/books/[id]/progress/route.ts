import { assertSameOrigin } from '@/lib/http'
import { saveEbookProgress } from '@/lib/jellyfinBooks'
import { TOO_LARGE, badRequest, invalidId, itemIdParam, readJsonCapped, tooLarge } from '../../../_lib/request'

const MAX_BODY = 4 * 1024

// PUT: remember the page a reader is on (kept in this app's DB — Jellyfin has no
// usable reading progress for books).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const id = await itemIdParam(params)
  if (!id) return invalidId()
  const body = await readJsonCapped<{ page?: unknown; pages?: unknown; rtl?: unknown }>(request, MAX_BODY)
  if (body === TOO_LARGE) return tooLarge(MAX_BODY)
  if (!body) return badRequest('Invalid JSON')
  const page = Number(body.page)
  const pages = Number(body.pages)
  if (!Number.isInteger(page) || !Number.isInteger(pages) || page < 1 || pages < 1 || page > pages || pages > 100_000) {
    return badRequest('Invalid progress')
  }
  saveEbookProgress(id, { page, pages, rtl: body.rtl === true })
  return Response.json({ ok: true })
}
