import { notFound } from 'next/navigation'
import { getReelDetail } from '@/lib/jellyfinServer'
import { EpisodeDetail } from '@/app/_components/media/EpisodeDetail'

export const dynamic = 'force-dynamic'

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string; seasonId: string; episodeId: string }>
}) {
  const { id, seasonId, episodeId } = await params
  const detail = await getReelDetail(id)
  if (!detail || detail.type !== 'tv') notFound()
  return <EpisodeDetail detail={detail} seasonId={seasonId} episodeId={episodeId} />
}
