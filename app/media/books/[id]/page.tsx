import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getEbook } from '@/lib/jellyfinBooks'
import { BookReader } from '@/app/_components/media/books/BookReader'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const book = await getEbook(id).catch(() => null)
  return { title: book ? `${book.title}${book.author ? ` · ${book.author}` : ''}` : 'Book' }
}

export default async function BookReaderPage({ params }: Props) {
  const { id } = await params
  const book = await getEbook(id)
  if (!book) notFound()
  return <BookReader book={book} />
}
