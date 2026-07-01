import { notFound } from 'next/navigation'
import { getReelDetail, getReelEpisodeDetail, getMediaInfo, getReelSimilar } from '@/lib/jellyfinServer'
import { EpisodeDetail } from '@/app/_components/media/EpisodeDetail'

export const dynamic = 'force-dynamic'

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string; seasonId: string; episodeId: string }>
}) {
  const { id, seasonId, episodeId } = await params
  const [detail, episode, media, similar] = await Promise.all([
    getReelDetail(id),
    getReelEpisodeDetail(episodeId),
    getMediaInfo(episodeId),
    getReelSimilar(id),
  ])
  if (!detail || detail.type !== 'tv') notFound()
  return <EpisodeDetail detail={detail} episode={episode} seasonId={seasonId} episodeId={episodeId} media={media} similar={similar} />
}
