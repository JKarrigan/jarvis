import { changeTags, listTagCounts } from '@/lib/photos/db'
import { jsonError, parseIdList, readJsonObject } from '@/lib/photos/http'
import { assertSameOrigin } from '@/lib/http'
import { markCatalogDirty } from '@/lib/photos/catalog'
import { MAX_TAGS_PER_REQUEST, parseTagList } from '@/lib/photos/tags'

export const dynamic = 'force-dynamic'

// GET /api/photos/tags — [{ tag, count }] over live items, most used first, then by name.
export async function GET() {
  return Response.json(listTagCounts(), { headers: { 'Cache-Control': 'no-store' } })
}

// POST /api/photos/tags — { ids, add?, remove? } → { ok, changed } (items whose tags changed).
// Unknown ids are ignored; a tag in both lists is removed.
export async function POST(request: Request) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const body = await readJsonObject(request)
  if (!body) return jsonError(400, 'Invalid JSON body')
  const ids = parseIdList(body.ids)
  if (!ids || ids.length === 0) return jsonError(400, 'ids must be an array of 1–1000 ids')
  const add = body.add === undefined ? [] : parseTagList(body.add)
  const remove = body.remove === undefined ? [] : parseTagList(body.remove)
  if (!add || !remove) return jsonError(400, `add/remove must be arrays of up to ${MAX_TAGS_PER_REQUEST} tags (1–40 characters)`)
  if (add.length === 0 && remove.length === 0) return jsonError(400, 'Nothing to change: give add and/or remove')
  const changed = changeTags(ids, add, remove)
  if (changed > 0) markCatalogDirty()
  return Response.json({ ok: true, changed })
}
