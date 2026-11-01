import { intParam } from '@/lib/http'
import { assertStorageOnline, searchEntries, filesErrorResponse } from '@/lib/files'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const offline = await assertStorageOnline()
  if (offline) return offline
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim().slice(0, 200)
  if (!q) return Response.json({ results: [], truncated: false })
  const limit = intParam(searchParams.get('limit'), { def: 200, min: 1, max: 500 })
  try {
    const { results, truncated } = await searchEntries(searchParams.get('path') ?? '', q, { limit, signal: request.signal })
    return Response.json({ results, truncated })
  } catch (e) {
    return filesErrorResponse(e, 'search')
  }
}
