import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAudiobook, getAudiobooks } from '@/lib/jellyfinAudiobooks'
import { AudiobookDetailView } from '@/app/_components/media/audiobooks/AudiobookDetailView'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const book = await getAudiobook(id).catch(() => null)
  return { title: book ? `${book.title}${book.author ? ` · ${book.author}` : ''}` : 'Audiobook', description: book?.synopsis }
}

export default async function AudiobookDetailPage({ params }: Props) {
  const { id } = await params
  const [book, all] = await Promise.all([getAudiobook(id), getAudiobooks().catch(() => [])])
  if (!book) notFound()
  const more = book.author ? all.filter(b => b.id !== book.id && b.author === book.author) : []
  return <AudiobookDetailView book={book} more={more} />
}
