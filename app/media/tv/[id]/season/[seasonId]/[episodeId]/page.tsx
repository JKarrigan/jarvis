import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getReelDetail, getReelEpisodeDetail, getMediaInfo, getReelSimilar } from '@/lib/jellyfinServer'
import { EpisodeDetail } from '@/app/_components/media/EpisodeDetail'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string; seasonId: string; episodeId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { episodeId } = await params
  const ep = await getReelEpisodeDetail(episodeId).catch(() => null)
  return {
    title: ep ? `${ep.seriesName} · S${ep.seasonIndex}E${ep.episodeIndex} · ${ep.title}` : 'Episode',
    description: ep?.synopsis,
  }
}

export default async function EpisodePage({ params }: Props) {
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
