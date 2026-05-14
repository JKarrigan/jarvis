import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import busboy from 'busboy'
import { resolveSafe, FILES_ROOT } from '@/lib/files'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const relPath = searchParams.get('path') ?? ''

  let dirAbs: string
  try {
    dirAbs = resolveSafe(relPath)
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const contentType = request.headers.get('content-type')
  if (!contentType?.startsWith('multipart/form-data')) {
    return Response.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  if (!request.body) {
    return Response.json({ error: 'Empty body' }, { status: 400 })
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const bb = busboy({ headers: { 'content-type': contentType } })

      bb.on('file', (_field, fileStream, info) => {
        const safeName = path.basename(info.filename)
        const dest = path.join(dirAbs, safeName)
        if (!dest.startsWith(FILES_ROOT)) {
          fileStream.resume()
          return
        }
        const writeStream = fs.createWriteStream(dest)
        fileStream.pipe(writeStream)
        writeStream.on('error', reject)
        fileStream.on('error', reject)
      })

      bb.on('finish', resolve)
      bb.on('error', reject)

      Readable.fromWeb(request.body as import('stream/web').ReadableStream).pipe(bb)
    })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }

  return Response.json({ ok: true })
}
