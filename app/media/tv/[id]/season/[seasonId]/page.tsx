import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getReelDetail } from '@/lib/jellyfinServer'
import { SeasonView } from '@/app/_components/media/SeasonView'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string; seasonId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, seasonId } = await params
  const detail = await getReelDetail(id).catch(() => null)
  const season = detail?.seasonList?.find(s => s.id === seasonId)
  return { title: detail && season ? `${detail.title} · ${season.name}` : 'Season' }
}

export default async function SeasonPage({ params }: Props) {
  const { id, seasonId } = await params
  const detail = await getReelDetail(id)
  if (!detail || detail.type !== 'tv' || !detail.seasonList?.some(s => s.id === seasonId)) notFound()
  return <SeasonView detail={detail} seasonId={seasonId} />
}
