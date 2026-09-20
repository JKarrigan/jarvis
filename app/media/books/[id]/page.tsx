import { notFound } from 'next/navigation'
import { getEbook } from '@/lib/jellyfinBooks'
import { BookReader } from '@/app/_components/media/books/BookReader'

export const dynamic = 'force-dynamic'

export default async function BookReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const book = await getEbook(id)
  if (!book) notFound()
  return <BookReader book={book} />
}
