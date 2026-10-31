import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCatalog, getBoxSets } from '@/lib/jellyfinServer'
import { CollectionDetail } from '@/app/_components/media/CollectionDetail'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const collections = await getBoxSets().catch(() => [])
  const c = collections.find(x => x.id === id)
  return { title: c?.name ?? 'Collection', description: c?.tagline }
}

export default async function CollectionDetailPage({ params }: Props) {
  const { id } = await params
  const [catalog, collections] = await Promise.all([getCatalog(), getBoxSets()])
  const collection = collections.find(c => c.id === id)
  if (!collection) notFound()
  return <CollectionDetail catalog={catalog} collection={collection} />
}
