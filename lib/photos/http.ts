import 'server-only'
import { PHOTO_ID_RE } from './types'

/** JSON error response. */
export function jsonError(status: number, error: string, headers?: HeadersInit): Response {
  return Response.json({ error }, { status, headers })
}

export function isId(v: unknown): v is string {
  return typeof v === 'string' && PHOTO_ID_RE.test(v)
}

/** Clamp an optional integer query param; NaN/absent → fallback. */
export function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw == null || !/^-?\d+$/.test(raw)) return fallback
  return Math.min(max, Math.max(min, Number(raw)))
}

const MAX_JSON_BYTES = 256 * 1024

/** Parse a JSON object body; returns null for anything else (bad JSON, arrays, too large). */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const len = Number(request.headers.get('content-length') ?? 0)
  if (len > MAX_JSON_BYTES) return null
  let text: string
  try { text = await request.text() } catch { return null }
  if (text.length > MAX_JSON_BYTES) return null
  try {
    const v: unknown = JSON.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const MAX_IDS = 1000

/** Validate an array of ids (deduplicated); null if not an array of valid ids or too long. */
export function parseIdList(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > MAX_IDS || !v.every(isId)) return null
  return [...new Set(v)]
}

/** Album names: trimmed, 1–200 chars, no control characters. */
export function parseName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return s.length >= 1 && s.length <= 200 ? s : null
}
