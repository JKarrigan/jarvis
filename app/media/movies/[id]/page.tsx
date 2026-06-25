import { notFound } from 'next/navigation'
import { getReelDetail, getMediaInfo, getReelSimilar } from '@/lib/jellyfinServer'
import { DetailView } from '@/app/_components/media/DetailView'

export const dynamic = 'force-dynamic'

export default async function MovieDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ play?: string }>
}) {
  const { id } = await params
  const { play } = await searchParams
  const [detail, media, similar] = await Promise.all([getReelDetail(id), getMediaInfo(id), getReelSimilar(id)])
  if (!detail || detail.type !== 'movie') notFound()
  return <DetailView detail={detail} media={media} similar={similar} autoPlay={play === '1'} />
}
