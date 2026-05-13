import fs from 'fs'
import path from 'path'
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

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 })
  }

  const files = formData.getAll('files') as File[]
  for (const file of files) {
    const dest = path.join(dirAbs, path.basename(file.name))
    if (!dest.startsWith(FILES_ROOT)) continue
    const buf = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(dest, buf)
  }

  return Response.json({ ok: true })
}
