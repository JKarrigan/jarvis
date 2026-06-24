import { getCatalog, getBoxSets } from '@/lib/jellyfinServer'
import { MediaProvider } from '@/app/_components/media/MediaProvider'
import { MediaThemeRoot } from '@/app/_components/media/MediaThemeRoot'
import { MediaShell } from '@/app/_components/media/MediaShell'

export const dynamic = 'force-dynamic'

export default async function MediaLayout({ children }: { children: React.ReactNode }) {
  // Fetched once here (cached ~5 min) to power the global Search modal.
  const [catalog, collections] = await Promise.all([getCatalog(), getBoxSets()])
  return (
    <MediaProvider>
      <MediaThemeRoot>
        <MediaShell catalog={catalog} collections={collections}>{children}</MediaShell>
      </MediaThemeRoot>
    </MediaProvider>
  )
}
