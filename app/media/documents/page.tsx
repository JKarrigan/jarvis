import { Suspense } from 'react'
import type { Metadata } from 'next'
import { DocumentsBrowser } from '@/app/_components/media/documents/DocumentsBrowser'
import { DocumentsSkeleton } from '@/app/_components/media/documents/DocumentsSkeleton'

export const metadata: Metadata = { title: 'Documents' }

// Client-rendered against /api/files/**; the shell only provides the Suspense boundary
// that useSearchParams (`?folder=` and the `?view=` viewer) needs.
export default function DocumentsPage() {
  return (
    <Suspense fallback={<DocumentsSkeleton />}>
      <DocumentsBrowser />
    </Suspense>
  )
}
