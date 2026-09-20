import { setAudiobookFinished } from '@/lib/jellyfinAudiobooks'

// POST marks the book finished; DELETE marks it unplayed, which also clears the
// resume position ("Start over").
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ok = await setAudiobookFinished(id, true)
  return Response.json({ ok }, { status: ok ? 200 : 502 })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ok = await setAudiobookFinished(id, false)
  return Response.json({ ok }, { status: ok ? 200 : 502 })
}
