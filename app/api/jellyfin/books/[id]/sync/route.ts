import type { NarrationLine, NarrationPageChar, NarrationSync } from '@/app/_components/media/types'
import { getNarrationSync, saveNarrationSync } from '@/lib/jellyfinBooks'

const okId = (id: string) => /^[0-9a-f]{32}$/i.test(id)
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

// GET: a book's narration timings (404 when none have been uploaded).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sync = okId(id) ? getNarrationSync(id) : null
  return sync ? Response.json(sync) : Response.json({ error: 'No timings' }, { status: 404 })
}

// PUT: store timings produced by scripts/sync-narration.py. Only known fields are kept.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!okId(id)) return Response.json({ error: 'Bad id' }, { status: 400 })
  let body: Partial<NarrationSync>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > 20_000 || !num(body.duration) || !num(body.pages)) {
    return Response.json({ error: 'Invalid timings' }, { status: 400 })
  }
  const lines: NarrationLine[] = []
  for (const l of body.lines) {
    if (!l || !num(l.start) || !num(l.end) || typeof l.text !== 'string' || !Number.isInteger(l.page) || l.page < 0 || !Array.isArray(l.words)) {
      return Response.json({ error: 'Invalid line' }, { status: 400 })
    }
    const words = l.words.filter(w => w && num(w.s) && num(w.e) && typeof w.w === 'string').map(w => ({ s: w.s, e: w.e, w: w.w.slice(0, 80) }))
    lines.push({ start: l.start, end: l.end, text: l.text.slice(0, 600), page: l.page, words })
  }
  const unit = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 1
  const pageChars: Record<string, NarrationPageChar[]> = {}
  if (body.pageChars && typeof body.pageChars === 'object') {
    for (const [page, chars] of Object.entries(body.pageChars).slice(0, 2000)) {
      if (!/^\d{1,5}$/.test(page) || !Array.isArray(chars)) continue
      pageChars[page] = chars
        .filter(c => c && typeof c.ch === 'string' && unit(c.x) && unit(c.y) && unit(c.w) && unit(c.h))
        .slice(0, 4000)
        .map(c => ({ ch: c.ch.slice(0, 2), x: c.x, y: c.y, w: c.w, h: c.h }))
    }
  }
  saveNarrationSync(id, { v: 1, duration: body.duration, pages: body.pages, lines, ...(Object.keys(pageChars).length ? { pageChars } : {}) })
  return Response.json({ ok: true, lines: lines.length })
}
