import { fetchSnapshot, subscribe } from '@/lib/hueSse'
import { getBridgeConfig, HueBridgeError } from '@/lib/hue'

const HEARTBEAT_MS = 25_000
// Ask EventSource to wait this long before reconnecting after the stream ends
// (bridge unreachable / not configured) instead of its ~3 s default.
const RETRY_MS = 15_000

/**
 * Server-sent events: a full `{ lights, groups }` snapshot on connect and after
 * every bridge change. Problems are reported as `event: hue-error` frames
 * (`{ error, configured }`) followed by closing the stream, so the client keeps
 * its last data, shows the problem, and reconnects after RETRY_MS.
 * (Not `event: error` — EventSource uses that name for its own connection errors.)
 */
export async function GET(request: Request) {
  const encoder = new TextEncoder()
  let cleanup: (() => void) | null = null

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      let unsub: (() => void) | null = null
      let heartbeat: ReturnType<typeof setInterval> | null = null

      const close = () => {
        if (closed) return
        closed = true
        unsub?.()
        unsub = null
        if (heartbeat) clearInterval(heartbeat)
        heartbeat = null
        try { controller.close() } catch { /* already closed / cancelled */ }
      }
      cleanup = close

      const send = (frame: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(frame))
        } catch {
          close() // client went away
        }
      }

      const fail = (error: string, configured: boolean) => {
        send(`event: hue-error\ndata: ${JSON.stringify({ error, configured })}\n\n`)
        close()
      }

      send(`retry: ${RETRY_MS}\n\n`)

      if (!getBridgeConfig()) {
        fail('Hue Bridge not configured', false)
        return
      }

      // Always send a fresh snapshot so the client is never seeded from cache
      let snapshot: string
      try {
        snapshot = await fetchSnapshot()
      } catch (err) {
        if (!(err instanceof HueBridgeError)) console.error('[hue] stream snapshot failed:', err)
        fail(err instanceof HueBridgeError ? err.message : 'Could not reach the Hue Bridge', true)
        return
      }
      if (closed || request.signal.aborted) { close(); return }

      send(`data: ${snapshot}\n\n`)
      unsub = subscribe(json => send(`data: ${json}\n\n`))
      heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS)
    },
    cancel() {
      cleanup?.()
    },
  })

  request.signal.addEventListener('abort', () => cleanup?.(), { once: true })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
