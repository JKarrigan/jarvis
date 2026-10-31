import { isHueId, setLightState } from '@/lib/hue'
import { assertSameOrigin, readJson } from '@/lib/http'
import { hueErrorResponse } from '../errors'

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const forbidden = assertSameOrigin(request)
  if (forbidden) return forbidden

  const { id } = await params
  if (!isHueId(id)) return Response.json({ error: 'Invalid light id' }, { status: 400 })

  const body = await readJson<Record<string, unknown>>(request, 4096)
  if (!body || typeof body !== 'object') return Response.json({ error: 'Invalid body' }, { status: 400 })
  const state = {
    on: typeof body.on === 'boolean' ? body.on : undefined,
    brightness: num(body.brightness),
    colorTemp: num(body.colorTemp),
    hue: num(body.hue),
    saturation: num(body.saturation),
  }
  if (Object.values(state).every(v => v === undefined)) {
    return Response.json({ error: 'Nothing to change' }, { status: 400 })
  }

  try {
    await setLightState(id, state)
    return Response.json({ ok: true })
  } catch (err) {
    return hueErrorResponse(err, 'Could not update the light')
  }
}
