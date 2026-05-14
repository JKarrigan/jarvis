import { getJellyfinItem } from '@/lib/jellyfin'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getJellyfinItem(id)
  if (!item) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(item)
}
