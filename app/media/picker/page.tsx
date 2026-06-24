import { getCatalog } from '@/lib/jellyfinServer'
import { PickerView } from '@/app/_components/media/PickerView'

export const dynamic = 'force-dynamic'

export default async function PickerPage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  const { list } = await searchParams
  const catalog = await getCatalog()
  return <PickerView catalog={catalog} startFromList={list === '1'} />
}
