import { notFound } from 'next/navigation'
import { getJellyfinItem } from '@/lib/jellyfin'
import MediaDetail from '@/app/_components/media/MediaDetail'

export default async function TVDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const item = await getJellyfinItem(id)
  if (!item || item.Type !== 'Series') notFound()
  return <MediaDetail item={item} backHref="/media/tv" />
}
