import { assertSameOrigin } from '@/lib/http'
import { assertStorageOnline, createDirectory, filesErrorResponse } from '@/lib/files'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const offline = await assertStorageOnline()
  if (offline) return offline
  const { searchParams } = new URL(request.url)
  try {
    await createDirectory(searchParams.get('path'))
    return Response.json({ ok: true })
  } catch (e) {
    return filesErrorResponse(e, 'mkdir')
  }
}
