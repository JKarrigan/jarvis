import { moveEntry } from '@/lib/files'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  try {
    moveEntry(from, to)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
