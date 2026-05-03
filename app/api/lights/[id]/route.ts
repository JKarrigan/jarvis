import { setLightState } from '@/lib/hue'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json() as { on?: boolean; brightness?: number; colorTemp?: number; hue?: number; saturation?: number }

  try {
    await setLightState(id, body)
    return Response.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
