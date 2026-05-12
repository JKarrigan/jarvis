'use client'

import { MediaGrid } from '@/app/_components/media/MediaCard'
import { MOCK_PHOTOS } from '@/app/_components/media/mockData'

export default function PhotosPage() {
  return (
    <main className="py-6 space-y-6">
      <div className="px-4 md:px-6">
        <h1 className="text-2xl font-bold text-zinc-100">Photos</h1>
        <p className="text-sm text-zinc-500 mt-1">{MOCK_PHOTOS.length} albums</p>
      </div>
      <MediaGrid items={MOCK_PHOTOS} />
    </main>
  )
}
