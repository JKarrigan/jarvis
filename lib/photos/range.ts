import 'server-only'

export type RangeResult =
  | { kind: 'full' }
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'unsatisfiable' }

/**
 * Parse a single-range `Range` header (RFC 9110 §14.1.2): `bytes=a-b`, `bytes=a-`, `bytes=-n`.
 * Malformed or multi-range headers are ignored (full response), as the RFC allows.
 */
export function parseRange(header: string | null, size: number): RangeResult {
  if (!header) return { kind: 'full' }
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return { kind: 'full' }
  if (m[1] === '') {
    // Suffix range: last n bytes.
    const n = Number(m[2])
    if (!Number.isSafeInteger(n)) return { kind: 'full' }
    if (n === 0 || size === 0) return { kind: 'unsatisfiable' }
    return { kind: 'partial', start: Math.max(0, size - n), end: size - 1 }
  }
  const start = Number(m[1])
  const end = m[2] === '' ? Infinity : Number(m[2])
  if (!Number.isSafeInteger(start) || end < start) return { kind: 'full' } // invalid → ignore
  if (start >= size) return { kind: 'unsatisfiable' }
  return { kind: 'partial', start, end: Math.min(end, size - 1) }
}
