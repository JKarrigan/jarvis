import { lookup } from 'dns/promises'

async function resolveHost(ip: string | null): Promise<{ fetchHost: string } | { error: string; status: number }> {
  if (!ip) return { error: 'Invalid host', status: 400 }

  let host = ip
  if (ip.startsWith('http')) {
    try { host = new URL(ip).hostname } catch {
      return { error: 'Invalid host', status: 400 }
    }
  }

  const validHost = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.local$/.test(host)
  if (!validHost) return { error: 'Invalid host', status: 400 }

  let fetchHost = host
  if (host.endsWith('.local')) {
    try {
      const { address } = await lookup(host)
      fetchHost = address
    } catch {
      return { error: 'Could not resolve hostname', status: 503 }
    }
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
  const ip = new URL(request.url).searchParams.get('ip')
  const resolved = await resolveHost(ip)
  if ('error' in resolved) return Response.json({ error: resolved.error }, { status: resolved.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
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
