import { getCatalog, getFeatured, getReelResume } from '@/lib/jellyfinServer'
import { HomeBody } from '@/app/_components/media/HomeBody'

// Always render against the live Jellyfin server (fetches still cache for 5 min).
export const dynamic = 'force-dynamic'

export default async function MediaHomePage() {
  const [catalog, resume] = await Promise.all([getCatalog(), getReelResume()])
  const featured = await getFeatured(catalog)
  return <HomeBody featured={featured} resume={resume} catalog={catalog} />
}
