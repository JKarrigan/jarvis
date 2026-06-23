import { notFound } from 'next/navigation'
import { getJellyfinItem, getSimilar } from '@/lib/jellyfinServer'
import MediaDetail from '@/app/_components/media/MediaDetail'

export default async function TVDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [item, moreLikeThis] = await Promise.all([getJellyfinItem(id), getSimilar(id, 'tv')])
  if (!item || item.Type !== 'Series') notFound()
  return <MediaDetail item={item} backHref="/media/tv" moreLikeThis={moreLikeThis} />
}
