import { getCatalog, getBoxSets } from '@/lib/jellyfinServer'
import { CollectionDetail } from '@/app/_components/media/CollectionDetail'

export const dynamic = 'force-dynamic'

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [catalog, collections] = await Promise.all([getCatalog(), getBoxSets()])
  const collection = collections.find(c => c.id === id) ?? null
  return <CollectionDetail catalog={catalog} collection={collection} />
}
