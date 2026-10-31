import { Suspense } from 'react'
import type { Metadata } from 'next'
import { TrashView } from '@/app/_components/media/photos/TrashView'
import { PhotosSkeleton } from '@/app/_components/media/photos/PhotosSkeleton'

export const metadata: Metadata = { title: 'Recently deleted · Photos' }

export default function PhotoTrashPage() {
  return (
    <Suspense fallback={<PhotosSkeleton />}>
      <TrashView />
    </Suspense>
  )
}
