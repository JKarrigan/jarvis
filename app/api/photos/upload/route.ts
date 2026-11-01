import { assertSameOrigin } from '@/lib/http'
import fs from 'fs'
import path from 'path'
import { Readable, type Writable } from 'stream'
import { pipeline } from 'stream/promises'
import busboy from 'busboy'
import { extOf, kindForExt } from '@/lib/photos/config'
import { newId } from '@/lib/photos/db'
import { jsonError } from '@/lib/photos/http'
import { checkLibraryOnline, requestScan } from '@/lib/photos/scan'
import { ingestUpload, sanitizeName, uploadTmpDir } from '@/lib/photos/store'
import type { UploadResult } from '@/lib/photos/types'

export const dynamic = 'force-dynamic'

const MAX_FILES = 500
const MAX_FILE_BYTES = 20 * 1024 ** 3

// POST /api/photos/upload — multipart, many files. Each file is written to PHOTOS_ROOT/.uploading,
// deduplicated by hash and moved to YYYY/MM/<name>. Returns { results: UploadResult[] } in file order.
export async function POST(request: Request) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const contentType = request.headers.get('content-type')
  if (!contentType?.startsWith('multipart/form-data')) return jsonError(415, 'Expected multipart/form-data')
  if (!request.body) return jsonError(400, 'Empty body')
  if (!(await checkLibraryOnline())) return jsonError(503, 'Library offline', { 'Retry-After': '60' })

  const tmpDir = uploadTmpDir()
  try {
    await fs.promises.mkdir(tmpDir, { recursive: true })
  } catch {
    return jsonError(503, 'Library not writable')
  }

  const results: UploadResult[] = []
  const tmpFiles = new Set<string>()
  const openStreams = new Set<Writable>()
  let chain: Promise<void> = Promise.resolve()
  let tooMany = false

  try {
    await new Promise<void>((resolve, reject) => {
      let bb: busboy.Busboy
      try {
        bb = busboy({
          headers: { 'content-type': contentType },
          defParamCharset: 'utf8',
          limits: { files: MAX_FILES, fileSize: MAX_FILE_BYTES, fields: 50, fieldSize: 64 * 1024 },
        })
      } catch (e) {
        reject(e)
        return
      }

      bb.on('file', (_field, file, info) => {
        const name = info.filename ?? ''
        if (!name) { file.resume(); return }
        const ext = extOf(sanitizeName(name))
        if (!kindForExt(ext)) {
          file.resume()
          results.push({ name, status: 'error', error: 'Unsupported file type' })
          return
        }
        const idx = results.push({ name, status: 'error', error: 'Incomplete upload' }) - 1
        const tmp = path.join(tmpDir, `${newId()}.${ext}`)
        tmpFiles.add(tmp)
        let truncated = false
        file.on('limit', () => { truncated = true })
        const ws = fs.createWriteStream(tmp, { flags: 'wx' })
        openStreams.add(ws)
        const written = pipeline(file, ws).finally(() => openStreams.delete(ws))
        written.catch(() => {}) // observed below; avoid unhandled rejection while queued
        chain = chain.then(async () => {
          try {
            await written
          } catch {
            results[idx] = { name, status: 'error', error: 'Upload interrupted' }
            return
          }
          if (truncated) {
            results[idx] = { name, status: 'error', error: 'File too large' }
            await fs.promises.rm(tmp, { force: true })
          } else {
            results[idx] = await ingestUpload(tmp, name)
          }
          tmpFiles.delete(tmp)
        })
      })
      bb.on('filesLimit', () => { tooMany = true })
      bb.on('close', resolve)
      bb.on('error', reject)

      const src = Readable.fromWeb(request.body as import('stream/web').ReadableStream<Uint8Array>)
      src.on('error', (e) => { bb.destroy(e); reject(e) })
      src.pipe(bb)
    })
    await chain
  } catch (e) {
    // Client went away or the body was malformed: stop writing, drop partial files.
    for (const ws of openStreams) ws.destroy()
    await chain.catch(() => {})
    await Promise.all([...tmpFiles].map(f => fs.promises.rm(f, { force: true })))
    if (results.some(r => r.status === 'created')) requestScan()
    return jsonError(400, `Upload failed: ${(e as Error).message ?? 'error'}`)
  }

  if (results.some(r => r.status === 'created')) requestScan()
  return Response.json({ results, ...(tooMany ? { warning: `Only the first ${MAX_FILES} files were accepted` } : {}) })
}
