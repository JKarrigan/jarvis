import type { SearchIndex } from '@/app/_components/media/types'
import { getBoxSets, getCatalog } from '@/lib/jellyfinServer'
import { getAudiobooks } from '@/lib/jellyfinAudiobooks'
import { getEbooks } from '@/lib/jellyfinBooks'

// Compact index for the global Search modal, fetched when it opens (it used to be
// serialised into every media page's RSC payload). No gradient strings — the client
// derives artwork from `hue`. Any one source failing just leaves its section empty.
export async function GET() {
  const [catalog, collections, audiobooks, ebooks] = await Promise.all([
    getCatalog().catch(() => []),
    getBoxSets().catch(() => []),
    getAudiobooks().catch(() => []),
    getEbooks().catch(() => []),
  ])
  const index: SearchIndex = {
    titles: catalog.map(t => ({ id: t.id, title: t.title, year: t.year, type: t.type, genres: t.genres.slice(0, 3), hue: t.hue, posterUrl: t.posterUrl })),
    collections: collections.map(c => ({ id: c.id, name: c.name, hue: c.hue, count: c.itemIds.length })),
    audiobooks: audiobooks.map(b => ({ id: b.id, title: b.title, author: b.author, narrator: b.narrator, hue: b.hue, coverUrl: b.coverUrl })),
    ebooks: ebooks.map(b => ({ id: b.id, title: b.title, author: b.author, level: b.level, hue: b.hue, coverUrl: b.coverUrl })),
  }
  return Response.json(index, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
