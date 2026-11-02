import { Suspense } from 'react'
import type { Metadata } from 'next'
import { TrashView } from '@/app/_components/media/photos/TrashView'
import { PhotosSkeleton } from '@/app/_components/media/photos/PhotosSkeleton'

export const metadata: Metadata = { title: 'Recently deleted · Photos' }

// Rendered per request like the other media pages. As a prerendered static page, Next's
// router reused the URL of the first load (search params included) when a Link or
// router.push targeted this route again, so the rail's link could land back in the
// folder or viewer the tab was first opened at.
export const dynamic = 'force-dynamic'

export default function PhotoTrashPage() {
  return (
    <Suspense fallback={<PhotosSkeleton />}>
      <TrashView />
    </Suspense>
  )
}
