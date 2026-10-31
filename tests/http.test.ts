import { describe, expect, it } from 'vitest'
import { assertSameOrigin, intParam, isLanHost, numParam, parseRange, rangeNotSatisfiable } from '@/lib/http'

describe('parseRange', () => {
  const size = 1000

  it('returns null when the header is absent (serve 200)', () => {
    expect(parseRange(null, size)).toBeNull()
    expect(parseRange('', size)).toBeNull()
  })

  it('parses an explicit range', () => {
    expect(parseRange('bytes=0-499', size)).toEqual({ start: 0, end: 499 })
    expect(parseRange('bytes=0-0', size)).toEqual({ start: 0, end: 0 })
    expect(parseRange('  bytes=10-20  ', size)).toEqual({ start: 10, end: 20 })
  })

  it('treats an open-ended range as "to the last byte"', () => {
    expect(parseRange('bytes=0-', size)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=999-', size)).toEqual({ start: 999, end: 999 })
  })

  it('clamps an end past the resource to the last byte (no Content-Length desync)', () => {
    expect(parseRange('bytes=900-5000', size)).toEqual({ start: 900, end: 999 })
  })

  it('handles suffix ranges (bytes=-N is the last N bytes, not NaN)', () => {
    expect(parseRange('bytes=-500', size)).toEqual({ start: 500, end: 999 })
    expect(parseRange('bytes=-1', size)).toEqual({ start: 999, end: 999 })
    // A suffix longer than the resource means the whole resource.
    expect(parseRange('bytes=-5000', size)).toEqual({ start: 0, end: 999 })
  })

  it('rejects unsatisfiable ranges with 416 instead of throwing a 500', () => {
    expect(parseRange('bytes=500-100', size)).toBe('invalid') // start > end
    expect(parseRange(`bytes=${size}-`, size)).toBe('invalid') // start at EOF
    expect(parseRange('bytes=2000-3000', size)).toBe('invalid') // start past EOF
    expect(parseRange('bytes=-0', size)).toBe('invalid') // zero-length suffix
    expect(parseRange('bytes=99999999999999999999-', size)).toBe('invalid') // not a safe integer
  })

  it('treats any range on an empty file as unsatisfiable', () => {
    expect(parseRange('bytes=0-', 0)).toBe('invalid')
    expect(parseRange('bytes=-10', 0)).toBe('invalid')
  })

  it('ignores headers it cannot parse (serve 200 rather than crash)', () => {
    expect(parseRange('bytes', size)).toBeNull() // no "="
    expect(parseRange('0-100', size)).toBeNull()
    expect(parseRange('items=0-10', size)).toBeNull() // unknown unit
    expect(parseRange('bytes=-', size)).toBeNull()
    expect(parseRange('bytes=a-b', size)).toBeNull()
    expect(parseRange('bytes=0-10,20-30', size)).toBeNull() // multi-range is not supported
    expect(parseRange('bytes=-5-10', size)).toBeNull()
  })
})

describe('rangeNotSatisfiable', () => {
  it('responds 416 with the resource size', () => {
    const res = rangeNotSatisfiable(1234)
    expect(res.status).toBe(416)
    expect(res.headers.get('Content-Range')).toBe('bytes */1234')
  })
})

describe('intParam', () => {
  const opts = { def: 100, min: 1, max: 3600 }

  it('falls back to the default for missing or non-numeric input', () => {
    expect(intParam(null, opts)).toBe(100)
    expect(intParam(undefined, opts)).toBe(100)
    expect(intParam('', opts)).toBe(100)
    expect(intParam('abc', opts)).toBe(100)
  })

  it('parses integers and truncates decimals', () => {
    expect(intParam('42', opts)).toBe(42)
    expect(intParam('42.9', opts)).toBe(42)
  })

  it('clamps into [min, max] (limit=-1 must not mean unlimited)', () => {
    expect(intParam('-1', opts)).toBe(1)
    expect(intParam('0', opts)).toBe(1)
    expect(intParam('999999', opts)).toBe(3600)
  })

  it('defaults min to 0 and max to MAX_SAFE_INTEGER', () => {
    expect(intParam('-5', { def: 3 })).toBe(0)
    expect(intParam('123456789', { def: 3 })).toBe(123456789)
  })
})

describe('numParam', () => {
  it('accepts finite numbers within range and rejects the rest', () => {
    expect(numParam('51.5', -90, 90)).toBe(51.5)
    expect(numParam('-0.12', -180, 180)).toBe(-0.12)
    expect(numParam('91', -90, 90)).toBeNull()
    expect(numParam('abc', -90, 90)).toBeNull()
    expect(numParam('Infinity', -90, 90)).toBeNull()
    expect(numParam('', -90, 90)).toBeNull()
    expect(numParam(null, -90, 90)).toBeNull()
  })
})

describe('isLanHost', () => {
  it('accepts private and link-local IPv4 addresses', () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.13', '169.254.10.20']) {
      expect(isLanHost(ip), ip).toBe(true)
    }
  })

  it('rejects public, loopback and out-of-range addresses', () => {
    for (const ip of ['8.8.8.8', '127.0.0.1', '172.15.0.1', '172.32.0.1', '192.169.0.1', '0.0.0.0', '256.1.1.1', '192.168.1']) {
      expect(isLanHost(ip), ip).toBe(false)
    }
  })

  it('accepts .local mDNS names', () => {
    expect(isLanHost('airgradient.local')).toBe(true)
    expect(isLanHost('Hue-Bridge.local')).toBe(true)
    expect(isLanHost('airgradient_84fce612eff4.local')).toBe(true)
  })

  it('rejects ports, paths, userinfo and other SSRF shapes', () => {
    for (const host of [
      '192.168.1.13:80',
      '192.168.1.13/admin',
      'airgradient.local:8080',
      'airgradient.local/x',
      'user@192.168.1.13',
      'evil.com#.local',
      'example.com',
      'a.b.local',
      '-bad.local',
      'bad-.local',
      '.local',
      'localhost',
      '::1',
      'fe80::1',
      '',
    ]) {
      expect(isLanHost(host), host).toBe(false)
    }
  })

  it('rejects non-strings and over-long names', () => {
    expect(isLanHost(undefined)).toBe(false)
    expect(isLanHost(null)).toBe(false)
    expect(isLanHost(192168113)).toBe(false)
    expect(isLanHost({ host: '192.168.1.13' })).toBe(false)
    expect(isLanHost(`${'a'.repeat(250)}.local`)).toBe(false)
  })
})

describe('assertSameOrigin', () => {
  const req = (headers: Record<string, string>) =>
    new Request('http://192.168.1.13:3000/api/files/delete', { method: 'POST', headers })

  it('allows clients that send neither Sec-Fetch-Site nor Origin (curl, scripts)', () => {
    expect(assertSameOrigin(req({}))).toBeNull()
  })

  it('allows same-origin and user-initiated requests', () => {
    expect(assertSameOrigin(req({ 'sec-fetch-site': 'same-origin' }))).toBeNull()
    expect(assertSameOrigin(req({ 'sec-fetch-site': 'none' }))).toBeNull()
    expect(assertSameOrigin(req({
      'sec-fetch-site': 'same-origin',
      origin: 'http://192.168.1.13:3000',
      host: '192.168.1.13:3000',
    }))).toBeNull()
  })

  it('rejects cross-site and same-site requests', async () => {
    for (const site of ['cross-site', 'same-site']) {
      const res = assertSameOrigin(req({ 'sec-fetch-site': site }))
      expect(res?.status, site).toBe(403)
      expect(await res?.json()).toEqual({ error: 'Cross-origin request rejected' })
    }
  })

  it('rejects an Origin whose host differs from Host (incl. DNS rebinding / other port)', () => {
    expect(assertSameOrigin(req({ origin: 'http://evil.example', host: '192.168.1.13:3000' }))?.status).toBe(403)
    expect(assertSameOrigin(req({ origin: 'http://192.168.1.13:8080', host: '192.168.1.13:3000' }))?.status).toBe(403)
  })

  it('rejects a malformed Origin, or an Origin without a Host', () => {
    expect(assertSameOrigin(req({ origin: 'not a url', host: '192.168.1.13:3000' }))?.status).toBe(403)
    expect(assertSameOrigin(req({ origin: 'null', host: '192.168.1.13:3000' }))?.status).toBe(403)
    expect(assertSameOrigin(req({ origin: 'http://192.168.1.13:3000' }))?.status).toBe(403)
  })
})
