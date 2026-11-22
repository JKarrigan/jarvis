import type { Metadata } from 'next'
import { getCatalog } from '@/lib/jellyfinServer'
import { LibraryView } from '@/app/_components/media/library'

export const metadata: Metadata = { title: 'Movies' }

export const dynamic = 'force-dynamic'

// Filters, sort and view live in the URL and are read on the client (useFilteredLibrary).
export default async function MoviesPage() {
  const catalog = await getCatalog()
  return <LibraryView catalog={catalog} title="Movies" base="movie" />
}
