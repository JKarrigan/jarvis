import type { Metadata } from 'next'
import { FileBrowser } from '@/app/_components/FileBrowser'

export const metadata: Metadata = { title: 'Files' }

export default function FilesPage() {
  return <FileBrowser />
}
