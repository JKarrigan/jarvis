import { listDirectory, getDiskInfo, FILES_ROOT } from '@/lib/files'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const relPath = searchParams.get('path') ?? ''
  try {
    const entries = listDirectory(relPath)
    const disk = getDiskInfo(FILES_ROOT)
    return Response.json({ entries, disk })
  } catch (e) {
    const msg = e instanceof Error && (e as NodeJS.ErrnoException).code === 'ENOENT'
      ? `Storage not found at ${FILES_ROOT} — is the SD card mounted?`
      : String(e)
    return Response.json({ error: msg }, { status: 500 })
  }
}
