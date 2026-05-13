import { searchEntries } from '@/lib/files'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  if (!q) return Response.json({ results: [] })
  try {
    const results = searchEntries('', q)
    return Response.json({ results })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
