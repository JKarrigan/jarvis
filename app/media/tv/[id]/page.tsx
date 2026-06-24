import { notFound } from 'next/navigation'
import { getReelDetail, getFileInfo, getReelSimilar } from '@/lib/jellyfinServer'
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
  const [detail, file, similar] = await Promise.all([getReelDetail(id), getFileInfo(id), getReelSimilar(id)])
  if (!detail || detail.type !== 'tv') notFound()
  return <DetailView detail={detail} file={file} similar={similar} autoPlay={play === '1'} />
}
