import { notFound } from 'next/navigation'
import { getPerson } from '@/lib/jellyfinServer'
import { PersonDetail } from '@/app/_components/media/PersonDetail'

export const dynamic = 'force-dynamic'

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const person = await getPerson(id)
  if (!person) notFound()
  return <PersonDetail person={person} />
}
