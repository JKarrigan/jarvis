import { getCatalog, getFeatured, getReelResume, getBoxSets } from '@/lib/jellyfinServer'
import { getAudiobooks } from '@/lib/jellyfinAudiobooks'
import { getEbooks } from '@/lib/jellyfinBooks'
import { HomeBody } from '@/app/_components/media/HomeBody'

// Always render against the live Jellyfin server (fetches still cache for 5 min).
export const dynamic = 'force-dynamic'

export default async function MediaHomePage() {
  const [catalog, resume, collections, audiobooks, ebooks] = await Promise.all([getCatalog(), getReelResume(), getBoxSets(), getAudiobooks(), getEbooks()])
  const featured = await getFeatured(catalog)
  return <HomeBody featured={featured} resume={resume} catalog={catalog} collections={collections} audiobooks={audiobooks} ebooks={ebooks} />
}
