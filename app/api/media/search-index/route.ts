import type { ReelCredit, SearchIndex, SearchPerson } from '@/app/_components/media/types'
import { getBoxSets, getCatalog, getTitleCredits } from '@/lib/jellyfinServer'
import { getAudiobooks } from '@/lib/jellyfinAudiobooks'
import { getEbooks } from '@/lib/jellyfinBooks'

// Compact index for the global Search modal, fetched when it opens (it used to be
// serialised into every media page's RSC payload). No gradient strings — the client
// derives artwork from `hue`. Any one source failing just leaves its section empty.
export async function GET() {
  const [catalog, credits, collections, audiobooks, ebooks] = await Promise.all([
    getCatalog().catch(() => []),
    getTitleCredits().catch(() => new Map<string, ReelCredit[]>()),
    getBoxSets().catch(() => []),
    getAudiobooks().catch(() => []),
    getEbooks().catch(() => []),
  ])

  // People (search by director / actor), aggregated across the catalog. Their titles
  // are referenced by position in `titles` to keep the index small.
  const people = new Map<string, SearchPerson>()
  catalog.forEach((t, i) => {
    for (const c of credits.get(t.id) ?? []) {
      let p = people.get(c.id)
      if (!p) {
        p = { id: c.id, name: c.name, directed: [], acted: [] }
        people.set(c.id, p)
      }
      p.imageUrl ??= c.imageUrl
      ;(c.director ? p.directed : p.acted).push(i)
    }
  })

  const index: SearchIndex = {
    titles: catalog.map(t => ({ id: t.id, title: t.title, year: t.year, type: t.type, genres: t.genres.slice(0, 3), hue: t.hue, posterUrl: t.posterUrl })),
    collections: collections.map(c => ({ id: c.id, name: c.name, hue: c.hue, count: c.itemIds.length })),
    audiobooks: audiobooks.map(b => ({ id: b.id, title: b.title, author: b.author, narrator: b.narrator, hue: b.hue, coverUrl: b.coverUrl })),
    ebooks: ebooks.map(b => ({ id: b.id, title: b.title, author: b.author, level: b.level, hue: b.hue, coverUrl: b.coverUrl })),
    people: [...people.values()],
  }
  return Response.json(index, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
