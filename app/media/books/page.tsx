import { getEbooks } from '@/lib/jellyfinBooks'
import { BooksView } from '@/app/_components/media/books/BooksView'

export const dynamic = 'force-dynamic'

export default async function BooksPage() {
  const books = await getEbooks()
  return <BooksView books={books} />
}
