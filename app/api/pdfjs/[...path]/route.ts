import { readFile } from 'node:fs/promises'
import path from 'node:path'

// Serves pdf.js's runtime assets straight from node_modules: the worker, the CJK
// character maps (Japanese PDFs with non-embedded fonts render blank without them),
// the standard fonts and the image-decoder wasm. Keeps them out of /public and in
// lockstep with the installed pdfjs-dist version. The Documents PDF reader also loads the
// viewer component's stylesheet and the images it references from here (only while a
// PDF is open, so its global rules never reach the rest of the app).
const ROOT = path.join(process.cwd(), 'node_modules', 'pdfjs-dist')
const ALLOWED = [/^legacy\/build\/pdf\.worker\.min\.mjs$/, /^cmaps\/[\w.-]+$/, /^standard_fonts\/[\w.-]+$/, /^wasm\/[\w.-]+$/, /^iccs\/[\w.-]+$/,
  /^legacy\/web\/pdf_viewer\.css$/, /^legacy\/web\/images\/[\w.-]+\.(?:svg|gif|png)$/]
const TYPES: Record<string, string> = {
  '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf', '.icc': 'application/vnd.iccprofile',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.png': 'image/png',
}

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.join('/')
  if (rel.split('/').includes('..') || !ALLOWED.some(re => re.test(rel))) return new Response('Not found', { status: 404 })
  try {
    const data = await readFile(path.join(ROOT, rel))
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': TYPES[path.extname(rel)] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
