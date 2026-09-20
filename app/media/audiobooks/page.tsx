import { getAudiobooks } from '@/lib/jellyfinAudiobooks'
import { AudiobooksView } from '@/app/_components/media/audiobooks/AudiobooksView'

export const dynamic = 'force-dynamic'

export default async function AudiobooksPage() {
  const books = await getAudiobooks()
  return <AudiobooksView books={books} />
}
