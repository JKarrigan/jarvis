import type { AudiobookEdit } from '@/app/_components/media/types'
import { updateAudiobook } from '@/lib/jellyfinAudiobooks'

// PATCH: save edited details (description / narrator / year → Jellyfin, chapter names → app DB).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: AudiobookEdit
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const edit: AudiobookEdit = {}
  if (typeof body.narrator === 'string') edit.narrator = body.narrator
  if (typeof body.synopsis === 'string') edit.synopsis = body.synopsis
  if (body.year === null || (typeof body.year === 'number' && Number.isInteger(body.year) && body.year > 0 && body.year < 3000)) edit.year = body.year
  if (Array.isArray(body.chapterTitles) && body.chapterTitles.length <= 2000 && body.chapterTitles.every(t => typeof t === 'string')) {
    edit.chapterTitles = body.chapterTitles
  }
  const ok = await updateAudiobook(id, edit)
  return Response.json({ ok }, { status: ok ? 200 : 502 })
}
