import { getLights, getGroups } from '@/lib/hue'
import { initHueSse } from '@/lib/hueSse'
import { getSetting } from '@/lib/db'

export async function GET() {
  const ip = getSetting('hue_bridge_ip')
  const key = getSetting('hue_api_key')
  if (!ip || !key) {
    return Response.json({ error: 'Hue Bridge not configured' }, { status: 503 })
  }

  initHueSse()

  try {
    const [lights, groups] = await Promise.all([getLights(), getGroups()])
    return Response.json({ lights, groups })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
