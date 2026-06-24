import { notFound } from 'next/navigation'
import { getReelDetail } from '@/lib/jellyfinServer'
import { SeasonView } from '@/app/_components/media/SeasonView'

export const dynamic = 'force-dynamic'

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ id: string; seasonId: string }>
}) {
  const { id, seasonId } = await params
  const detail = await getReelDetail(id)
  if (!detail || detail.type !== 'tv' || !detail.seasonList?.some(s => s.id === seasonId)) notFound()
  return <SeasonView detail={detail} seasonId={seasonId} />
}
