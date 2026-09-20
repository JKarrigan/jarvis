import { getCatalog, getBoxSets } from '@/lib/jellyfinServer'
import { getAudiobooks } from '@/lib/jellyfinAudiobooks'
import { getEbooks } from '@/lib/jellyfinBooks'
import { MediaProvider } from '@/app/_components/media/MediaProvider'
import { MediaThemeRoot } from '@/app/_components/media/MediaThemeRoot'
import { MediaShell } from '@/app/_components/media/MediaShell'

export const dynamic = 'force-dynamic'

export default async function MediaLayout({ children }: { children: React.ReactNode }) {
  // Fetched once here (cached ~5 min) to power the global Search modal.
  const [catalog, collections, audiobooks, ebooks] = await Promise.all([getCatalog(), getBoxSets(), getAudiobooks(), getEbooks()])
  return (
    <MediaProvider>
      <MediaThemeRoot>
        <MediaShell catalog={catalog} collections={collections} audiobooks={audiobooks} ebooks={ebooks}>{children}</MediaShell>
      </MediaThemeRoot>
    </MediaProvider>
  )
}
