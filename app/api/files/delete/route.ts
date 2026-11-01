import { assertSameOrigin } from '@/lib/http'
import { assertStorageOnline, deleteEntry, filesErrorResponse } from '@/lib/files'

export const dynamic = 'force-dynamic'

/**
 * DELETE ?path=<entry>[&recursive=0]. Folders are removed recursively by
 * default (the client confirms first); `recursive=0` only removes an empty
 * folder and answers 409 when it still has children (including hidden files).
 */
export async function DELETE(request: Request) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const offline = await assertStorageOnline()
  if (offline) return offline
  const { searchParams } = new URL(request.url)
  const recursive = searchParams.get('recursive') !== '0'
  try {
    await deleteEntry(searchParams.get('path'), { recursive })
    return Response.json({ ok: true })
  } catch (e) {
    return filesErrorResponse(e, 'delete')
  }
}
