import { startPoller, getPollerStatus } from '@/lib/poller'

function validateHost(ip: string): string | null {
  let host = ip
  if (ip.startsWith('http')) {
    try { host = new URL(ip).hostname } catch { return null }
  }
  const valid = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.local$/.test(host)
  return valid ? host : null
}

export async function POST(request: Request) {
  const body = await request.json() as { ip?: string }
  const host = validateHost(body?.ip ?? '')
  if (!host) return Response.json({ error: 'Invalid host' }, { status: 400 })
  startPoller(host)
  return Response.json({ ok: true })
}

export async function GET() {
  return Response.json(getPollerStatus())
}
