import { getCatalog } from '@/lib/jellyfinServer'
import { LibraryView } from '@/app/_components/media/library'

export const dynamic = 'force-dynamic'

export default async function MoviesPage({ searchParams }: { searchParams: Promise<{ genre?: string; tag?: string }> }) {
  const { genre, tag } = await searchParams
  const catalog = await getCatalog()
  return <LibraryView catalog={catalog} title="Movies" base="movie" initialGenre={genre} initialTag={tag} />
}
