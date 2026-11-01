import { FILES_ROOT, getDiskInfo, storageOnline } from '@/lib/files'
import type { FilesStatus } from '@/lib/fileTypes'

export const dynamic = 'force-dynamic'

/** GET → `{ online, root: 'documents', disk }` (disk is null while offline). Drives the offline banner. */
export async function GET() {
  const online = await storageOnline()
  const body: FilesStatus = { online, root: 'documents', disk: online ? await getDiskInfo(FILES_ROOT) : null }
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
