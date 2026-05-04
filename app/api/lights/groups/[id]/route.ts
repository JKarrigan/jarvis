import { setGroupAction } from '@/lib/hue'
import { notifyGroupOnAction } from '@/lib/hueSse'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json() as { on?: boolean; brightness?: number; colorTemp?: number }

  if (body.on !== undefined) notifyGroupOnAction(id)

  try {
    await setGroupAction(id, body)
    return Response.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
