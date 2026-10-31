import type { Metadata } from 'next'
import { AlbumsView } from '@/app/_components/media/photos/AlbumsView'

export const metadata: Metadata = { title: 'Albums · Photos' }

export default function PhotoAlbumsPage() {
  return <AlbumsView />
}
