import { notFound } from 'next/navigation'
import { getReelDetail, getReelSimilar } from '@/lib/jellyfinServer'
import { DetailView } from '@/app/_components/media/DetailView'

export const dynamic = 'force-dynamic'

export default async function TVDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ play?: string }>
}) {
  const { id } = await params
  const { play } = await searchParams
  // A series has no single playable file — version/audio/subtitle listings live on the
  // episode pages, so we don't fetch media info here (DetailView hides the pickers).
  const [detail, similar] = await Promise.all([getReelDetail(id), getReelSimilar(id)])
  if (!detail || detail.type !== 'tv') notFound()
  return <DetailView detail={detail} media={null} similar={similar} autoPlay={play === '1'} />
}
