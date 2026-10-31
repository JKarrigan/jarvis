import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPerson } from '@/lib/jellyfinServer'
import { PersonDetail } from '@/app/_components/media/PersonDetail'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const person = await getPerson(id).catch(() => null)
  return { title: person?.name ?? 'Person', description: person?.overview }
}

export default async function PersonPage({ params }: Props) {
  const { id } = await params
  const person = await getPerson(id)
  if (!person) notFound()
  return <PersonDetail person={person} />
}
