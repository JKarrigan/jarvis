import MediaLibrary from '@/app/_components/media/MediaLibrary'
import { getMovies } from '@/lib/jellyfinServer'

export const dynamic = 'force-dynamic'

export default async function MoviesPage() {
  const movies = await getMovies({ limit: 400 })
  return (
    <MediaLibrary
      title="Movies"
      countNoun="titles"
      items={movies}
      searchPlaceholder="Search movies…"
    />
  )
}
