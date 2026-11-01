import { redirect } from 'next/navigation'

/** The old Air-side file browser moved to the media app's Documents section. */
export default function FilesPage() {
  redirect('/media/documents')
}
