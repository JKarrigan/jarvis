import type { Metadata } from 'next'
import { getBoxSets, getCatalog } from '@/lib/jellyfinServer'
import { PickerView } from '@/app/_components/media/PickerView'

export const metadata: Metadata = { title: 'Movie Picker' }

export const dynamic = 'force-dynamic'

export default async function PickerPage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  const { list } = await searchParams
  const [catalog, collections] = await Promise.all([getCatalog(), getBoxSets().catch(() => [])])
  return <PickerView catalog={catalog} collections={collections} startFromList={list === '1'} />
}
