import { getLights, getGroups, getBridgeConfig } from '@/lib/hue'
import { hueErrorResponse } from './errors'

export async function GET() {
  if (!getBridgeConfig()) {
    return Response.json({ error: 'Hue Bridge not configured' }, { status: 503 })
  }

  try {
    const [lights, groups] = await Promise.all([getLights(), getGroups()])
    return Response.json({ lights, groups })
  } catch (err) {
    return hueErrorResponse(err, 'Could not reach the Hue Bridge')
  }
}
