import type { AudiobookEdit } from '@/app/_components/media/types'
import { assertSameOrigin } from '@/lib/http'
import { updateAudiobook } from '@/lib/jellyfinAudiobooks'
import { TOO_LARGE, badRequest, invalidId, itemIdParam, readJsonCapped, tooLarge } from '../../_lib/request'

const MAX_BODY = 512 * 1024

// PATCH: save edited details (description / narrator / year → Jellyfin, chapter names → app DB).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const id = await itemIdParam(params)
  if (!id) return invalidId()
  const body = await readJsonCapped<AudiobookEdit>(request, MAX_BODY)
  if (body === TOO_LARGE) return tooLarge(MAX_BODY)
  if (!body || typeof body !== 'object') return badRequest('Invalid JSON')
  const edit: AudiobookEdit = {}
  if (typeof body.narrator === 'string') edit.narrator = body.narrator.slice(0, 200)
  if (typeof body.synopsis === 'string') edit.synopsis = body.synopsis.slice(0, 20_000)
  if (body.year === null || (typeof body.year === 'number' && Number.isInteger(body.year) && body.year > 0 && body.year < 3000)) edit.year = body.year
  if (Array.isArray(body.chapterTitles) && body.chapterTitles.length <= 2000 && body.chapterTitles.every(t => typeof t === 'string')) {
    edit.chapterTitles = body.chapterTitles
  }
  const ok = await updateAudiobook(id, edit)
  return Response.json({ ok }, { status: ok ? 200 : 502 })
}
