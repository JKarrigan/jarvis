import { Suspense } from 'react'
import type { Metadata } from 'next'
import { PhotosTimeline } from '@/app/_components/media/photos/PhotosTimeline'
import { PhotosSkeleton } from '@/app/_components/media/photos/PhotosSkeleton'

export const metadata: Metadata = { title: 'Photos' }

// Rendered per request like the other media pages. As a prerendered static page, Next's
// router reused the URL of the first load (search params included) when a Link or
// router.push targeted this route again, so the rail's link could land back in the
// folder or viewer the tab was first opened at.
export const dynamic = 'force-dynamic'

// Client-rendered against /api/photos/**; the shell only provides the Suspense boundary
// that useSearchParams (the `?v=` viewer) needs.
export default function PhotosPage() {
  return (
    <Suspense fallback={<PhotosSkeleton />}>
      <PhotosTimeline />
    </Suspense>
  )
}
