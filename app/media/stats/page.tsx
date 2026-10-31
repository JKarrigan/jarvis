import type { Metadata } from 'next'
import { getCatalog } from '@/lib/jellyfinServer'
import { StatsView } from '@/app/_components/media/StatsView'

export const metadata: Metadata = { title: 'Your year in film' }

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const catalog = await getCatalog()
  return <StatsView catalog={catalog} />
}
