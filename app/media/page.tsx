import type { Metadata } from 'next'
import { getCatalog, getFeatured, getReelResume, getBoxSets } from '@/lib/jellyfinServer'
import { getAudiobooks } from '@/lib/jellyfinAudiobooks'
import { getEbooks } from '@/lib/jellyfinBooks'
import { HomeBody } from '@/app/_components/media/HomeBody'

// A layout's title template applies to child segments only, so name this page outright.
export const metadata: Metadata = { title: { absolute: 'Reel' } }

// Always render against the live Jellyfin server (lists are cached server-side).
export const dynamic = 'force-dynamic'

export default async function MediaHomePage() {
  // The catalog is the page; if it can't load, the media error page explains why.
  // The secondary rows just disappear when their source is down.
  const [catalog, resume, collections, audiobooks, ebooks] = await Promise.all([
    getCatalog(),
    getReelResume().catch(() => []),
    getBoxSets().catch(() => []),
    getAudiobooks().catch(() => []),
    getEbooks().catch(() => []),
  ])
  const featured = await getFeatured(catalog)
  return <HomeBody featured={featured} resume={resume} catalog={catalog} collections={collections} audiobooks={audiobooks} ebooks={ebooks} />
}
