import { assertStorageOnline, folderStats, filesErrorResponse } from '@/lib/files'

export const dynamic = 'force-dynamic'

/**
 * GET ?path=<folder> → `{ files, folders, bytes, truncated }` (recursive, hidden
 * entries skipped, bounded at 20k entries). A file answers `{ files: 1, … }`.
 */
export async function GET(request: Request) {
  const offline = await assertStorageOnline()
  if (offline) return offline
  const { searchParams } = new URL(request.url)
  try {
    return Response.json(await folderStats(searchParams.get('path') ?? '', request.signal))
  } catch (e) {
    return filesErrorResponse(e, 'stat')
  }
}
