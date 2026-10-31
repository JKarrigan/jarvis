import { Suspense } from 'react'
import type { Metadata } from 'next'
import { PhotosTimeline } from '@/app/_components/media/photos/PhotosTimeline'
import { PhotosSkeleton } from '@/app/_components/media/photos/PhotosSkeleton'

export const metadata: Metadata = { title: 'Photos' }

// Client-rendered against /api/photos/**; the shell only provides the Suspense boundary
// that useSearchParams (the `?v=` viewer) needs.
export default function PhotosPage() {
  return (
    <Suspense fallback={<PhotosSkeleton />}>
      <PhotosTimeline />
    </Suspense>
  )
}
