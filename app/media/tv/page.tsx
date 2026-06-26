import { getCatalog } from '@/lib/jellyfinServer'
import { LibraryView } from '@/app/_components/media/library'

export const dynamic = 'force-dynamic'

export default async function TVPage({ searchParams }: { searchParams: Promise<{ genre?: string; tag?: string }> }) {
  const { genre, tag } = await searchParams
  const catalog = await getCatalog()
  return <LibraryView catalog={catalog} title="TV Shows" base="tv" initialGenre={genre} initialTag={tag} />
}
