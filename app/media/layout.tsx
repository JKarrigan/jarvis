import type { Metadata } from 'next'
import { MediaProvider } from '@/app/_components/media/MediaProvider'
import { MediaThemeRoot } from '@/app/_components/media/MediaThemeRoot'
import { MediaShell } from '@/app/_components/media/MediaShell'

export const metadata: Metadata = {
  // absolute: the app-wide template would otherwise turn the default into "Reel · Home".
  title: { template: '%s · Reel', absolute: 'Reel' },
  description: 'Movies, TV, books and photos from the home library.',
}

// No data here: the search index loads on demand (/api/media/search-index) when the
// search modal opens, so pages don't carry the whole library in every payload.
export default function MediaLayout({ children }: { children: React.ReactNode }) {
  return (
    <MediaProvider>
      <MediaThemeRoot>
        <MediaShell>{children}</MediaShell>
      </MediaThemeRoot>
    </MediaProvider>
  )
}
