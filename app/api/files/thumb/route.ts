import fsp from 'fs/promises'
import { assertStorageOnline, resolveSafe, filesErrorResponse, FilesError } from '@/lib/files'
import type { FileThumbSize } from '@/lib/fileTypes'
import { getFileThumb } from '../_lib/thumb'

export const dynamic = 'force-dynamic'

/**
 * GET ?path=<file>&size=t|p — WebP thumbnail (`t` 320 px, `p` 1280 px long
 * edge) for images (HEIC via the Photos tile-grid decoder) and PDFs (page 1 via
 * pdftoppm). 404 `{ error: 'No preview' }` for anything else, when pdftoppm is
 * not installed, or when the file could not be decoded. Cached under
 * FILES_CACHE keyed by path + size + mtime, so a changed file gets a new image.
 */
export async function GET(request: Request) {
  const offline = await assertStorageOnline()
  if (offline) return offline
  const { searchParams } = new URL(request.url)
  const relPath = searchParams.get('path') ?? ''
  const size: FileThumbSize = searchParams.get('size') === 'p' ? 'p' : 't'

  let thumb: string | null
  try {
    const abs = resolveSafe(relPath)
    const stat = await fsp.stat(abs)
    if (!stat.isFile()) throw new FilesError('Not a file', 400)
    thumb = await getFileThumb(relPath, abs, stat.mtimeMs, size)
  } catch (e) {
    return filesErrorResponse(e, 'thumb')
  }
  if (!thumb) return Response.json({ error: 'No preview' }, { status: 404 })

  let body: Buffer
  try {
    body = await fsp.readFile(thumb)
  } catch (e) {
    return filesErrorResponse(e, 'thumb read')
  }
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(body.length),
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
