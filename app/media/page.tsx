'use client'

import Link from 'next/link'
import { MediaRow } from '@/app/_components/media/MediaCard'
import { MOCK_CONTINUE_WATCHING, MOCK_MOVIES, MOCK_TV, MOCK_MUSIC, MOCK_BOOKS, MOCK_PHOTOS } from '@/app/_components/media/mockData'

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between px-4 md:px-6 mb-3">
      <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
      <Link href={href} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
        See All →
      </Link>
    </div>
  )
}

export default function MediaHomePage() {
  return (
    <main className="py-6 space-y-12">
      <div className="px-4 md:px-6">
        <h1 className="text-2xl font-bold text-zinc-100">Home</h1>
      </div>

      <section>
        <SectionHeader title="Continue Watching" href="/media" />
        <MediaRow items={MOCK_CONTINUE_WATCHING} />
      </section>

      <section>
        <SectionHeader title="Movies" href="/media/movies" />
        <MediaRow items={MOCK_MOVIES} />
      </section>

      <section>
        <SectionHeader title="TV Shows" href="/media/tv" />
        <MediaRow items={MOCK_TV} />
      </section>

      <section>
        <SectionHeader title="Music" href="/media/music" />
        <MediaRow items={MOCK_MUSIC} />
      </section>

      <section>
        <SectionHeader title="Photos" href="/media/photos" />
        <MediaRow items={MOCK_PHOTOS} />
      </section>

      <section>
        <SectionHeader title="Books" href="/media/books" />
        <MediaRow items={MOCK_BOOKS} />
      </section>
    </main>
  )
}
