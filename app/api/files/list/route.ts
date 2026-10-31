import { listDirectory, getDiskInfo, filesErrorResponse, FILES_ROOT } from '@/lib/files'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const relPath = searchParams.get('path') ?? ''
  try {
    const [entries, disk] = await Promise.all([listDirectory(relPath), getDiskInfo(FILES_ROOT)])
    return Response.json({ entries, disk })
  } catch (e) {
    if (relPath === '' && (e as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error('[files] storage root missing:', e)
      return Response.json({ error: 'Storage not found — is the SD card mounted?' }, { status: 503 })
    }
    return filesErrorResponse(e, 'list')
  }
}
