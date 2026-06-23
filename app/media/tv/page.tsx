import MediaLibrary from '@/app/_components/media/MediaLibrary'
import { getSeries } from '@/lib/jellyfinServer'

export const dynamic = 'force-dynamic'

export default async function TVPage() {
  const shows = await getSeries({ limit: 400 })
  return (
    <MediaLibrary
      title="TV Shows"
      countNoun="shows"
      items={shows}
      searchPlaceholder="Search shows…"
    />
  )
}
