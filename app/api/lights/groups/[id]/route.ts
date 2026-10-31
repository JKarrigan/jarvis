import { isHueId, setGroupAction } from '@/lib/hue'
import { assertSameOrigin, readJson } from '@/lib/http'
import { hueErrorResponse } from '../../errors'

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const forbidden = assertSameOrigin(request)
  if (forbidden) return forbidden

  const { id } = await params
  if (!isHueId(id)) return Response.json({ error: 'Invalid group id' }, { status: 400 })

  const body = await readJson<Record<string, unknown>>(request, 4096)
  if (!body || typeof body !== 'object') return Response.json({ error: 'Invalid body' }, { status: 400 })
  const action = {
    on: typeof body.on === 'boolean' ? body.on : undefined,
    brightness: num(body.brightness),
    colorTemp: num(body.colorTemp),
  }
  if (Object.values(action).every(v => v === undefined)) {
    return Response.json({ error: 'Nothing to change' }, { status: 400 })
  }

  try {
    await setGroupAction(id, action)
    return Response.json({ ok: true })
  } catch (err) {
    return hueErrorResponse(err, 'Could not update the room')
  }
}
