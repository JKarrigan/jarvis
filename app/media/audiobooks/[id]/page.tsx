import { notFound } from 'next/navigation'
import { getAudiobook, getAudiobooks } from '@/lib/jellyfinAudiobooks'
import { AudiobookDetailView } from '@/app/_components/media/audiobooks/AudiobookDetailView'

export const dynamic = 'force-dynamic'

export default async function AudiobookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [book, all] = await Promise.all([getAudiobook(id), getAudiobooks()])
  if (!book) notFound()
  const more = book.author ? all.filter(b => b.id !== book.id && b.author === book.author) : []
  return <AudiobookDetailView book={book} more={more} />
}
