import { getCatalog, getBoxSets } from '@/lib/jellyfinServer'
import { CollectionDetail } from '@/app/_components/media/CollectionDetail'

export const dynamic = 'force-dynamic'

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [catalog, franchises] = await Promise.all([getCatalog(), getBoxSets()])
  const franchise = franchises.find(f => f.id === id) ?? null
  return <CollectionDetail catalog={catalog} collectionId={id} franchise={franchise} />
}
