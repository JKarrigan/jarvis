import { setSetting } from '@/lib/db'
import { assertSameOrigin, readJson } from '@/lib/http'
import { getPollerStatus, normalizeDeviceHost, startPoller } from '@/lib/poller'
import { DEVICE_HOST_SETTING } from '@/lib/startup'

/**
 * POST /api/device { ip } — saves the AirGradient host server-side and
 * (re)targets the poller. The saved host is what the poller uses after a
 * restart (see lib/startup.ts), so browsers no longer drive polling.
 */
export async function POST(request: Request) {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected

  const body = await readJson<{ ip?: unknown }>(request, 4096)
  const host = normalizeDeviceHost(body?.ip)
  if (!host) {
    return Response.json(
      { error: 'Enter a private IPv4 address (e.g. 192.168.1.42) or an mDNS name ending in .local' },
      { status: 400 },
    )
  }
  setSetting(DEVICE_HOST_SETTING, host)
  startPoller(host)
  return Response.json({ ok: true, ip: host })
}

export async function GET() {
  return Response.json(getPollerStatus())
}
