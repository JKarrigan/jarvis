import fs from 'fs'
import { isId, jsonError } from '@/lib/photos/http'
import { DerivedError, getDerived } from '@/lib/photos/thumbs'

export const dynamic = 'force-dynamic'

// GET /api/photos/[id]/thumb?size=t|p — derived webp (400 px tile / 1600 px preview).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isId(id)) return jsonError(400, 'Invalid id')
  const size = new URL(request.url).searchParams.get('size') ?? 't'
  if (size !== 't' && size !== 'p') return jsonError(400, 'size must be t or p')
  try {
    const file = await getDerived(id, size)
    const buf = await fs.promises.readFile(file)
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(buf.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (e) {
    if (e instanceof DerivedError) {
      return jsonError(e.status, e.message, e.status === 503 ? { 'Retry-After': '30' } : undefined)
    }
    console.error('[photos] thumb failed', id, e)
    return jsonError(500, 'Thumbnail failed')
  }
}
