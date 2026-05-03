import { getSetting } from '@/lib/db'

export async function GET() {
  const ip = getSetting('hue_bridge_ip')
  const key = getSetting('hue_api_key')

  if (!ip || !key) return Response.json({ configured: false, ip: null, reachable: false })

  try {
    const res = await fetch(`http://${ip}/api/${key}/lights`, { signal: AbortSignal.timeout(3000) })
    return Response.json({ configured: true, ip, reachable: res.ok })
  } catch {
    return Response.json({ configured: true, ip, reachable: false })
  }
}
