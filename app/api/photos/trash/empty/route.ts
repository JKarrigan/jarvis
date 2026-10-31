import { emptyTrash } from '@/lib/photos/store'

export const dynamic = 'force-dynamic'

// POST /api/photos/trash/empty — permanently removes every trashed item and its file.
export async function POST() {
  const deleted = await emptyTrash()
  return Response.json({ ok: true, deleted })
}
