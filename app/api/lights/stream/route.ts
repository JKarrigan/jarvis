import { initHueSse, fetchSnapshot, subscribe } from '@/lib/hueSse'
import { getSetting } from '@/lib/db'

export async function GET(request: Request) {
  const ip = getSetting('hue_bridge_ip')
  const key = getSetting('hue_api_key')
  if (!ip || !key) {
    return Response.json({ error: 'Hue Bridge not configured' }, { status: 503 })
  }

  initHueSse()

  const encoder = new TextEncoder()
  let unsub: (() => void) | null = null

  const stream = new ReadableStream({
    async start(controller) {
      // Always send a fresh snapshot so the client is never seeded from cache
      try {
        const json = await fetchSnapshot()
        controller.enqueue(encoder.encode(`data: ${json}\n\n`))
      } catch (err) {
        controller.error(err)
        return
      }

      unsub = subscribe((json) => {
        try {
          controller.enqueue(encoder.encode(`data: ${json}\n\n`))
        } catch { /* client disconnected */ }
      })
    },
    cancel() {
      unsub?.()
      unsub = null
    },
  })

  request.signal.addEventListener('abort', () => {
    unsub?.()
    unsub = null
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
