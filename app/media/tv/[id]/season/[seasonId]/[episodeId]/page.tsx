import { notFound } from 'next/navigation'
import { getReelDetail, getMediaInfo } from '@/lib/jellyfinServer'
import { EpisodeDetail } from '@/app/_components/media/EpisodeDetail'

export const dynamic = 'force-dynamic'

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string; seasonId: string; episodeId: string }>
}) {
  const { id, seasonId, episodeId } = await params
  const [detail, media] = await Promise.all([getReelDetail(id), getMediaInfo(episodeId)])
  if (!detail || detail.type !== 'tv') notFound()
  return <EpisodeDetail detail={detail} seasonId={seasonId} episodeId={episodeId} media={media} />
}
