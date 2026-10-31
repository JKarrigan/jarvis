import { lookup } from 'dns/promises'
import { assertSameOrigin, isLanHost, readJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

/**
 * Only LAN devices may be proxied: a private IPv4 address or a `.local` name
 * that resolves to one (so this cannot be pointed at the internet or at a
 * DNS-rebinding name).
 */
async function resolveHost(ip: string | null): Promise<{ fetchHost: string } | { error: string; status: number }> {
  if (!ip) return { error: 'Invalid host', status: 400 }

  let host = ip
  if (ip.startsWith('http')) {
    try { host = new URL(ip).hostname } catch {
      return { error: 'Invalid host', status: 400 }
    }
  }

  if (!isLanHost(host)) return { error: 'Invalid host', status: 400 }

  let fetchHost = host
  if (host.toLowerCase().endsWith('.local')) {
    try {
      const { address } = await lookup(host, { family: 4 })
      fetchHost = address
    } catch {
      return { error: 'Could not resolve hostname', status: 503 }
    }
    if (!isLanHost(fetchHost)) return { error: 'Invalid host', status: 400 }
  }

  return { fetchHost }
}

export async function GET(request: Request) {
  const ip = new URL(request.url).searchParams.get('ip')
  const resolved = await resolveHost(ip)
  if ('error' in resolved) return Response.json({ error: resolved.error }, { status: resolved.status })

  try {
    const res = await fetch(`http://${resolved.fetchHost}/config`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return Response.json({ error: 'Device returned error' }, { status: 502 })
    return Response.json(await res.json())
  } catch {
    return Response.json({ error: 'Could not reach device' }, { status: 503 })
  }
}

export async function PUT(request: Request) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const ip = new URL(request.url).searchParams.get('ip')
  const resolved = await resolveHost(ip)
  if ('error' in resolved) return Response.json({ error: resolved.error }, { status: resolved.status })

  const body = await readJson<Record<string, unknown>>(request, 64 * 1024)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const res = await fetch(`http://${resolved.fetchHost}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return Response.json({ error: 'Device returned error' }, { status: 502 })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Could not reach device' }, { status: 503 })
  }
}
