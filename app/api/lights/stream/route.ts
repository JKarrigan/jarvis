import { initHueSse, getLightsAndGroups, subscribe } from '@/lib/hueSse'
import { getSetting } from '@/lib/db'

export async function GET(request: Request) {
  const ip = getSetting('hue_bridge_ip')
  const key = getSetting('hue_api_key')
  if (!ip || !key) {
    return Response.json({ error: 'Hue Bridge not configured' }, { status: 503 })
  }

  await initHueSse()

  const encoder = new TextEncoder()
  let unsub: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      // Push current state immediately so the client has data right away
      const snapshot = getLightsAndGroups()
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`))

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

  // Belt-and-suspenders: also clean up on request abort
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
