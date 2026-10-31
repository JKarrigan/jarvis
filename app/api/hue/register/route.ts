import { registerBridge, HueBridgeError } from '@/lib/hue'
import { resetHueSse } from '@/lib/hueSse'
import { setSetting } from '@/lib/db'
import { assertSameOrigin, isLanHost, readJson } from '@/lib/http'

export async function POST(request: Request) {
  const forbidden = assertSameOrigin(request)
  if (forbidden) return forbidden

  const body = await readJson<{ ip?: unknown }>(request, 4096)
  const ip = typeof body?.ip === 'string' ? body.ip.trim() : ''
  if (!ip) return Response.json({ ok: false, reason: 'missing_ip' }, { status: 400 })
  if (!isLanHost(ip)) {
    return Response.json(
      { ok: false, reason: 'Enter the bridge’s local IP address (e.g. 192.168.1.20) or its .local name' },
      { status: 400 },
    )
  }

  try {
    const key = await registerBridge(ip, request.signal)
    setSetting('hue_bridge_ip', ip)
    setSetting('hue_api_key', key)
    resetHueSse()
    return Response.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'press_button') return Response.json({ ok: false, reason: 'press_button' })
    console.error('[hue] register failed:', err)
    if (err instanceof HueBridgeError) return Response.json({ ok: false, reason: msg }, { status: 502 })
    return Response.json({ ok: false, reason: 'Could not reach the bridge at that address' }, { status: 502 })
  }
}
