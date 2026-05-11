import type { Metadata } from 'next'
import { EventsLog } from '@/app/_components/EventsLog'

export const metadata: Metadata = { title: 'Events' }

export default function EventsPage() {
  return <EventsLog />
}
