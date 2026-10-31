import { getSetting } from '@/lib/db'
import { getBridgeConfig } from '@/lib/hue'

export async function GET() {
  const cfg = getBridgeConfig()
  if (!cfg) return Response.json({ configured: false, ip: getSetting('hue_bridge_ip'), reachable: false })

  try {
    const res = await fetch(`http://${cfg.ip}/api/${cfg.key}/lights`, { signal: AbortSignal.timeout(3000) })
    return Response.json({ configured: true, ip: cfg.ip, reachable: res.ok })
  } catch {
    return Response.json({ configured: true, ip: cfg.ip, reachable: false })
  }
}
