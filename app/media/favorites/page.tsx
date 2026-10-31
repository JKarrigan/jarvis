import type { Metadata } from 'next'
import { getCatalog } from '@/lib/jellyfinServer'
import { LibraryView } from '@/app/_components/media/library'

export const metadata: Metadata = { title: 'Favorites' }

export const dynamic = 'force-dynamic'

export default async function FavoritesPage() {
  const catalog = await getCatalog()
  return <LibraryView catalog={catalog} title="Favorites" base="favorites" />
}
