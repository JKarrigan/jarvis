import { notFound } from 'next/navigation'
import { getJellyfinItem, getSimilar } from '@/lib/jellyfinServer'
import MediaDetail from '@/app/_components/media/MediaDetail'

export default async function MovieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [item, moreLikeThis] = await Promise.all([getJellyfinItem(id), getSimilar(id, 'movies')])
  if (!item || item.Type !== 'Movie') notFound()
  return <MediaDetail item={item} backHref="/media/movies" moreLikeThis={moreLikeThis} />
}
