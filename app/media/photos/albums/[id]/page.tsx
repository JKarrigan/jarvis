import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AlbumDetail } from '@/app/_components/media/photos/AlbumDetail'
import { PhotosSkeleton } from '@/app/_components/media/photos/PhotosSkeleton'
import { PHOTO_ID_RE } from '@/lib/photos/types'

export const metadata: Metadata = { title: 'Album · Photos' }

export default async function PhotoAlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!PHOTO_ID_RE.test(id)) notFound()
  return (
    <Suspense fallback={<PhotosSkeleton />}>
      <AlbumDetail id={id} />
    </Suspense>
  )
}
