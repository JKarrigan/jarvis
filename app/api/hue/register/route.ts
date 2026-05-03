import { registerBridge } from '@/lib/hue'
import { setSetting } from '@/lib/db'

export async function POST(request: Request) {
  const body = await request.json() as { ip?: string }
  const ip = body?.ip?.trim()
  if (!ip) return Response.json({ ok: false, reason: 'missing_ip' })

  try {
    const key = await registerBridge(ip)
    setSetting('hue_bridge_ip', ip)
    setSetting('hue_api_key', key)
    return Response.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'press_button') return Response.json({ ok: false, reason: 'press_button' })
    return Response.json({ ok: false, reason: msg })
  }
}
