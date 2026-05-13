import { renameEntry } from '@/lib/files'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const path = searchParams.get('path') ?? ''
  const name = (searchParams.get('name') ?? '').trim()
  try {
    renameEntry(path, name)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
