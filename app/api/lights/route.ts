import { getLights, getGroups } from '@/lib/hue'
import { initHueSse, getLightsAndGroups } from '@/lib/hueSse'
import { getSetting } from '@/lib/db'

export async function GET() {
  const ip = getSetting('hue_bridge_ip')
  const key = getSetting('hue_api_key')
  if (!ip || !key) {
    return Response.json({ error: 'Hue Bridge not configured' }, { status: 503 })
  }

  await initHueSse()
  const { lights, groups } = getLightsAndGroups()

  // Singleton cache is empty (init fetch failed or bridge was unreachable):
  // fall back to a direct fetch so the caller gets a proper error message.
  if (lights.length === 0 && groups.length === 0) {
    try {
      const [freshLights, freshGroups] = await Promise.all([getLights(), getGroups()])
      return Response.json({ lights: freshLights, groups: freshGroups })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return Response.json({ error: msg }, { status: 500 })
    }
  }

  return Response.json({ lights, groups })
}
