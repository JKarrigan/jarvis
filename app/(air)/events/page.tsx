import { Suspense } from 'react'
import type { Metadata } from 'next'
import { EventsLog, EventsLogSkeleton } from '@/app/_components/events/EventsLog'

export const metadata: Metadata = { title: 'Events' }

// EventsLog keeps its range and filters in the URL (useSearchParams), which needs a Suspense boundary.
export default function EventsPage() {
  return (
    <Suspense fallback={<EventsLogSkeleton />}>
      <EventsLog />
    </Suspense>
  )
}
