import type { Metadata } from 'next'
import { getCatalog } from '@/lib/jellyfinServer'
import { PickListView } from '@/app/_components/media/PickListView'

export const metadata: Metadata = { title: 'Picker list' }

export const dynamic = 'force-dynamic'

export default async function PickListPage() {
  const catalog = await getCatalog()
  return <PickListView catalog={catalog} />
}
