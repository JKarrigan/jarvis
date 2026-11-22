import type { Metadata } from 'next'
import { getCatalog } from '@/lib/jellyfinServer'
import { LibraryView } from '@/app/_components/media/library'

export const metadata: Metadata = { title: 'TV Shows' }

export const dynamic = 'force-dynamic'

// Filters, sort and view live in the URL and are read on the client (useFilteredLibrary).
export default async function TVPage() {
  const catalog = await getCatalog()
  return <LibraryView catalog={catalog} title="TV Shows" base="tv" />
}
