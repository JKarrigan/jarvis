import { fetchSubtitleVtt } from '@/lib/jellyfinServer'

// Proxies a text subtitle as WebVTT so the player can attach it as a same-origin
// <track> (no cross-origin track CORS, and the Jellyfin token stays server-side).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const id = params.get('id')
  const source = params.get('source')
  const index = params.get('index')
  if (!id || !source || index == null || index === '') {
    return new Response('Missing params', { status: 400 })
  }
  const vtt = await fetchSubtitleVtt(id, source, Number(index))
  if (vtt == null) return new Response('Subtitle unavailable', { status: 404 })
  return new Response(vtt, {
    headers: { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
