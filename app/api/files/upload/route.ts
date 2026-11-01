import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as NodeWebReadableStream } from 'stream/web'
import busboy from 'busboy'
import { assertSameOrigin, intParam } from '@/lib/http'
import {
  assertStorageOnline, resolveSafe, safeUploadName, uploadTempPath, commitNoClobber, filesErrorResponse, FilesError,
} from '@/lib/files'

export const dynamic = 'force-dynamic'

/** Per-file size cap (bytes); override with MAX_UPLOAD_BYTES. Default 8 GiB. */
const MAX_UPLOAD_BYTES = intParam(process.env.MAX_UPLOAD_BYTES, { def: 8 * 1024 ** 3, min: 1 })
const MAX_FILES = 50

function gib(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${+(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
}

/**
 * POST multipart/form-data into ?path=<folder>.
 *
 * Each file streams to a hidden `.name.<uuid>.part` temp file and is only
 * moved into place once fully written, without replacing anything:
 *   200 { ok: true, saved }                     all files stored
 *   409 { error, conflicts, saved }             some names already existed (others were saved)
 *   413 { error, saved }                        a file exceeded MAX_UPLOAD_BYTES or > 50 files
 * Aborted uploads leave no partial files behind.
 */
export async function POST(request: Request) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const offline = await assertStorageOnline()
  if (offline) return offline

  const { searchParams } = new URL(request.url)
  let dirAbs: string
  try {
    dirAbs = resolveSafe(searchParams.get('path') ?? '')
    if (!(await fsp.stat(dirAbs)).isDirectory()) throw new FilesError('Not a folder', 400)
  } catch (e) {
    return filesErrorResponse(e, 'upload')
  }

  const contentType = request.headers.get('content-type')
  if (!contentType?.startsWith('multipart/form-data')) {
    return Response.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }
  if (!request.body) return Response.json({ error: 'Empty body' }, { status: 400 })

  let bb: busboy.Busboy
  try {
    bb = busboy({
      headers: { 'content-type': contentType },
      limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_FILES, fields: 20, parts: MAX_FILES + 20 },
    })
  } catch {
    return Response.json({ error: 'Malformed multipart request' }, { status: 400 })
  }

  // Aborting this stops the request pipeline (client disconnect, a failed write,
  // or an oversized file), which also destroys any file stream in progress.
  const ac = new AbortController()
  const onClientAbort = () => ac.abort()
  request.signal.addEventListener('abort', onClientAbort, { once: true })

  const temps = new Set<string>()
  const writes: Promise<void>[] = []
  const saved: string[] = []
  const conflicts: string[] = []
  let tooLarge = false
  let tooMany = false

  bb.on('file', (_field, file, info) => {
    const name = safeUploadName(info.filename)
    if (!name) { file.resume(); return }
    const dest = path.join(dirAbs, name)
    const tmp = uploadTempPath(dirAbs, name)
    temps.add(tmp)
    // Deferred: busboy still touches the file stream right after emitting 'limit'.
    file.once('limit', () => { tooLarge = true; setImmediate(() => ac.abort()) })
    const write = (async () => {
      await pipeline(file, fs.createWriteStream(tmp, { flags: 'wx' }))
      if (file.truncated) throw new FilesError(`"${name}" exceeds the ${gib(MAX_UPLOAD_BYTES)} upload limit`, 413)
      try {
        await commitNoClobber(tmp, dest)
      } catch (e) {
        if (e instanceof FilesError && e.status === 409) { conflicts.push(name); return }
        throw e
      }
      temps.delete(tmp)
      saved.push(name)
    })()
    // Any write failure ends the whole upload (busboy would otherwise stall
    // waiting for the destroyed file stream to be consumed).
    write.catch(() => ac.abort())
    writes.push(write)
  })
  bb.on('filesLimit', () => { tooMany = true })

  let requestError: unknown = null
  try {
    await pipeline(
      Readable.fromWeb(request.body as unknown as NodeWebReadableStream<Uint8Array>),
      bb,
      { signal: ac.signal },
    )
  } catch (e) {
    requestError = e
  }
  // Only answer once every write stream has flushed (or failed).
  const results = await Promise.allSettled(writes)
  request.signal.removeEventListener('abort', onClientAbort)

  await Promise.all([...temps].map(t => fsp.unlink(t).catch(() => {})))

  if (tooLarge) {
    return Response.json({ error: `File exceeds the ${gib(MAX_UPLOAD_BYTES)} upload limit`, saved }, { status: 413 })
  }
  // Client went away: nobody reads the answer, and the partials are already gone.
  if (request.signal.aborted) return new Response(null, { status: 499 })
  const writeError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason
  if (writeError) return filesErrorResponse(writeError, 'upload write')
  if (requestError) {
    console.error('[files] upload request failed:', requestError)
    return Response.json({ error: 'Upload failed', saved }, { status: 400 })
  }
  if (conflicts.length > 0) {
    const error = conflicts.length === 1
      ? `"${conflicts[0]}" already exists`
      : `${conflicts.length} files already exist: ${conflicts.join(', ')}`
    return Response.json({ error, conflicts, saved }, { status: 409 })
  }
  if (tooMany) return Response.json({ error: `Too many files (max ${MAX_FILES} per upload)`, saved }, { status: 413 })
  return Response.json({ ok: true, saved })
}
