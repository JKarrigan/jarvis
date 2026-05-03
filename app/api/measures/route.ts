import { lookup } from 'dns/promises'
import { insertReading } from '@/lib/db'

export async function GET(request: Request) {
  const ip = new URL(request.url).searchParams.get('ip')

  // Extract just the hostname if a full URL was passed
  let host = ip
  if (ip!.startsWith('http')) {
    try { host = new URL(ip!).hostname } catch {
      return Response.json({ error: 'Invalid host' }, { status: 400 })
    }
  }

  const validHost = /^(\d{1,3}\.){3}\d{1,3}$/.test(host!) || /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.local$/.test(host!)
  if (!validHost) {
    return Response.json({ error: 'Invalid host' }, { status: 400 })
  }

  // Node.js fetch doesn't support mDNS — resolve .local hostnames via the
  // system resolver (dns.lookup uses getaddrinfo which goes through Bonjour)
  let fetchHost = host
  if (host!.endsWith('.local')) {
    try {
      const { address } = await lookup(host!)
      fetchHost = address
    } catch {
      return Response.json({ error: 'Could not resolve hostname' }, { status: 503 })
    }
  }

  try {
    const res = await fetch(`http://${fetchHost}/measures/current`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      return Response.json({ error: 'Device returned error' }, { status: 502 })
    }
    const data = await res.json()
    try { insertReading(Date.now(), data) } catch { /* DB write is non-fatal */ }
    return Response.json(data)
  } catch {
    return Response.json({ error: 'Could not reach device' }, { status: 503 })
  }
}
