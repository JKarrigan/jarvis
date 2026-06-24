import { getCatalog } from '@/lib/jellyfinServer'
import { LibraryView } from '@/app/_components/media/library'

export const dynamic = 'force-dynamic'

export default async function TVPage() {
  const catalog = await getCatalog()
  return <LibraryView catalog={catalog} title="TV Shows" base="tv" />
}
