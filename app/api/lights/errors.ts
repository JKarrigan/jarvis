import { HueBridgeError } from '@/lib/hue'

/** Maps a Hue failure to a response without leaking internals (the bridge's own message is safe). */
export function hueErrorResponse(err: unknown, fallback: string): Response {
  if (err instanceof HueBridgeError) return Response.json({ error: err.message }, { status: 502 })
  const msg = err instanceof Error ? err.message : ''
  if (msg === 'Hue Bridge not configured') return Response.json({ error: msg }, { status: 503 })
  console.error(`[hue] ${fallback}:`, err)
  return Response.json({ error: fallback }, { status: 502 })
}
