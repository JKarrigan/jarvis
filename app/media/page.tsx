import { getCatalog, getFeatured, getReelResume, getBoxSets } from '@/lib/jellyfinServer'
import { HomeBody } from '@/app/_components/media/HomeBody'

// Always render against the live Jellyfin server (fetches still cache for 5 min).
export const dynamic = 'force-dynamic'

export default async function MediaHomePage() {
  const [catalog, resume, collections] = await Promise.all([getCatalog(), getReelResume(), getBoxSets()])
  const featured = await getFeatured(catalog)
  return <HomeBody featured={featured} resume={resume} catalog={catalog} collections={collections} />
}
