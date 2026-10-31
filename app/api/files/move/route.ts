import { assertSameOrigin } from '@/lib/http'
import { moveEntry, filesErrorResponse } from '@/lib/files'

export const dynamic = 'force-dynamic'

/** POST ?from=<entry>&to=<folder> — 409 when the destination already has that name. */
export async function POST(request: Request) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const { searchParams } = new URL(request.url)
  try {
    await moveEntry(searchParams.get('from'), searchParams.get('to'))
    return Response.json({ ok: true })
  } catch (e) {
    return filesErrorResponse(e, 'move')
  }
}
