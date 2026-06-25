import { getCatalog, getBoxSets } from '@/lib/jellyfinServer'
import { CollectionsList } from '@/app/_components/media/CollectionsList'

export const dynamic = 'force-dynamic'

export default async function CollectionsPage() {
  const [catalog, collections] = await Promise.all([getCatalog(), getBoxSets()])
  return <CollectionsList catalog={catalog} collections={collections} />
}
