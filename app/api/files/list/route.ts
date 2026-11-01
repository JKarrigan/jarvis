import { assertStorageOnline, listDirectory, getDiskInfo, filesErrorResponse, FILES_ROOT } from '@/lib/files'

export const dynamic = 'force-dynamic'

/** GET ?path=<folder> → `{ entries, disk }`; 503 `{ error: 'Storage offline', offline: true }` while unmounted. */
export async function GET(request: Request) {
  const offline = await assertStorageOnline()
  if (offline) return offline
  const { searchParams } = new URL(request.url)
  const relPath = searchParams.get('path') ?? ''
  try {
    const [entries, disk] = await Promise.all([listDirectory(relPath), getDiskInfo(FILES_ROOT)])
    return Response.json({ entries, disk })
  } catch (e) {
    return filesErrorResponse(e, 'list')
  }
}
