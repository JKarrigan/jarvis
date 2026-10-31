import { assertSameOrigin } from '@/lib/http'
import { renameEntry, filesErrorResponse } from '@/lib/files'

export const dynamic = 'force-dynamic'

/** POST ?path=<entry>&name=<new name> — 409 when the name is already taken. */
export async function POST(request: Request) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const { searchParams } = new URL(request.url)
  const name = (searchParams.get('name') ?? '').trim()
  try {
    await renameEntry(searchParams.get('path'), name)
    return Response.json({ ok: true })
  } catch (e) {
    return filesErrorResponse(e, 'rename')
  }
}
