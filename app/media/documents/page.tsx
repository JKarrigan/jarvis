import { Suspense } from 'react'
import type { Metadata } from 'next'
import { DocumentsBrowser } from '@/app/_components/media/documents/DocumentsBrowser'
import { DocumentsSkeleton } from '@/app/_components/media/documents/DocumentsSkeleton'

export const metadata: Metadata = { title: 'Documents' }

// Rendered per request like the other media pages. As a prerendered static page, Next's
// router reused the URL of the first load (search params included) when a Link or
// router.push targeted this route again, so the rail's link could land back in the
// folder or viewer the tab was first opened at.
export const dynamic = 'force-dynamic'

// Client-rendered against /api/files/**; the shell only provides the Suspense boundary
// that useSearchParams (`?folder=` and the `?view=` viewer) needs.
export default function DocumentsPage() {
  return (
    <Suspense fallback={<DocumentsSkeleton />}>
      <DocumentsBrowser />
    </Suspense>
  )
}
