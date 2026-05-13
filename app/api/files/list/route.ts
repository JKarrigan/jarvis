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
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
