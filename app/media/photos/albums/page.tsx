import type { Metadata } from 'next'
import { AlbumsView } from '@/app/_components/media/photos/AlbumsView'

export const metadata: Metadata = { title: 'Albums · Photos' }

// Rendered per request like the other media pages. As a prerendered static page, Next's
// router reused the URL of the first load (search params included) when a Link or
// router.push targeted this route again, so the rail's link could land back in the
// folder or viewer the tab was first opened at.
export const dynamic = 'force-dynamic'

export default function PhotoAlbumsPage() {
  return <AlbumsView />
}
