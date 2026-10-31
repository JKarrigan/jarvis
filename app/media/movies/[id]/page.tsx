import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getReelDetail, getMediaInfo, getReelSimilar } from '@/lib/jellyfinServer'
import { DetailView } from '@/app/_components/media/DetailView'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ play?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const detail = await getReelDetail(id).catch(() => null)
  return { title: detail?.type === 'movie' ? detail.title : 'Movie', description: detail?.synopsis }
}

export default async function MovieDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const { play } = await searchParams
  const [detail, media, similar] = await Promise.all([getReelDetail(id), getMediaInfo(id), getReelSimilar(id)])
  if (!detail || detail.type !== 'movie') notFound()
  return <DetailView detail={detail} media={media} similar={similar} autoPlay={play === '1'} />
}
