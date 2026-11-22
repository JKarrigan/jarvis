import { Suspense } from 'react'
import type { Metadata } from 'next'
import { EventsLog } from '@/app/_components/events/EventsLog'
import { PageState, Spinner } from '@/app/_components/air/ui'

export const metadata: Metadata = { title: 'Events' }

// EventsLog keeps its range and filters in the URL (useSearchParams), which needs a Suspense boundary.
export default function EventsPage() {
  return (
    <Suspense fallback={<PageState><Spinner /></PageState>}>
      <EventsLog />
    </Suspense>
  )
}
