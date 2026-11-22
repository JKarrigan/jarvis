import type { Metadata } from 'next'
import { EventDetail } from '@/app/_components/events/EventDetail'

export const metadata: Metadata = { title: 'Event' }

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EventDetail id={id} />
}
