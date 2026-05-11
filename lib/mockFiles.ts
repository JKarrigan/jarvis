export type FileEntry = {
  name: string
  kind: 'file'
  size: number
  modified: Date
  ext: string
}

export type DirEntry = {
  name: string
  kind: 'dir'
  modified: Date
  children: Entry[]
}

export type Entry = FileEntry | DirEntry

export type SortKey = 'name' | 'size' | 'modified'

const KB = 1024
const MB = 1024 * KB
const GB = 1024 * MB

const ROOT: DirEntry = {
  name: 'root',
  kind: 'dir',
  modified: new Date('2025-01-15'),
  children: [
    {
      name: 'Documents',
      kind: 'dir',
      modified: new Date('2025-01-14'),
      children: [
        { name: 'Taxes 2024.pdf', kind: 'file', size: Math.round(2.4 * MB), modified: new Date('2025-01-10'), ext: 'pdf' },
        { name: 'Home Insurance.pdf', kind: 'file', size: 890 * KB, modified: new Date('2024-11-20'), ext: 'pdf' },
        {
          name: 'Work',
          kind: 'dir',
          modified: new Date('2025-01-08'),
          children: [
            { name: 'Q1 Report.docx', kind: 'file', size: 340 * KB, modified: new Date('2025-01-08'), ext: 'docx' },
            { name: 'Budget.xlsx', kind: 'file', size: 128 * KB, modified: new Date('2025-01-06'), ext: 'xlsx' },
          ],
        },
      ],
    },
    {
      name: 'Photos',
      kind: 'dir',
      modified: new Date('2025-01-12'),
      children: [
        {
          name: 'Vacation 2024',
          kind: 'dir',
          modified: new Date('2024-08-22'),
          children: [
            { name: 'IMG_001.jpg', kind: 'file', size: Math.round(4.2 * MB), modified: new Date('2024-08-20'), ext: 'jpg' },
            { name: 'IMG_002.jpg', kind: 'file', size: Math.round(3.8 * MB), modified: new Date('2024-08-20'), ext: 'jpg' },
          ],
        },
        {
          name: 'Family',
          kind: 'dir',
          modified: new Date('2025-01-01'),
          children: [
            { name: 'Christmas.jpg', kind: 'file', size: Math.round(5.1 * MB), modified: new Date('2025-01-01'), ext: 'jpg' },
          ],
        },
      ],
    },
    {
      name: 'Videos',
      kind: 'dir',
      modified: new Date('2025-01-05'),
      children: [
        { name: 'Home Tour.mp4', kind: 'file', size: Math.round(1.2 * GB), modified: new Date('2025-01-05'), ext: 'mp4' },
      ],
    },
    {
      name: 'Backups',
      kind: 'dir',
      modified: new Date('2025-01-15'),
      children: [
        { name: 'MacBook Pro Jan 2025.tar.gz', kind: 'file', size: Math.round(45.2 * GB), modified: new Date('2025-01-15'), ext: 'gz' },
        { name: 'iPhone Jan 2025.zip', kind: 'file', size: Math.round(12.8 * GB), modified: new Date('2025-01-14'), ext: 'zip' },
      ],
    },
    { name: 'README.txt', kind: 'file', size: 2 * KB, modified: new Date('2024-12-01'), ext: 'txt' },
  ],
}

export function getEntries(path: string[]): Entry[] {
  let node: DirEntry = ROOT
  for (const seg of path) {
    const next = node.children.find((e): e is DirEntry => e.kind === 'dir' && e.name === seg)
    if (!next) return []
    node = next
  }
  return node.children
}

export function sortEntries(entries: Entry[], key: SortKey): Entry[] {
  const dirs = entries.filter((e): e is DirEntry => e.kind === 'dir')
  const files = entries.filter((e): e is FileEntry => e.kind === 'file')

  const cmp = (a: Entry, b: Entry): number => {
    if (key === 'name') return a.name.localeCompare(b.name)
    if (key === 'size') {
      const aSize = a.kind === 'file' ? a.size : 0
      const bSize = b.kind === 'file' ? b.size : 0
      return bSize - aSize
    }
    return b.modified.getTime() - a.modified.getTime()
  }

  return [...dirs.sort(cmp), ...files.sort(cmp)]
}

export function formatSize(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`
  if (bytes >= KB) return `${Math.round(bytes / KB)} KB`
  return `${bytes} B`
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export type FileTypeInfo = { label: string; color: string; iconKind: 'doc' | 'image' | 'video' | 'archive' | 'sheet' | 'text' | 'generic' }

export function fileTypeInfo(ext: string): FileTypeInfo {
  const e = ext.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'heic', 'webp', 'avif'].includes(e))
    return { label: 'Image', color: 'text-sky-400', iconKind: 'image' }
  if (['mp4', 'mov', 'avi', 'mkv', 'm4v'].includes(e))
    return { label: 'Video', color: 'text-purple-400', iconKind: 'video' }
  if (['zip', 'gz', 'tar', 'rar', '7z', 'bz2'].includes(e))
    return { label: 'Archive', color: 'text-orange-400', iconKind: 'archive' }
  if (['xlsx', 'xls', 'csv', 'numbers'].includes(e))
    return { label: 'Spreadsheet', color: 'text-emerald-400', iconKind: 'sheet' }
  if (['docx', 'doc', 'odt', 'pages'].includes(e))
    return { label: 'Document', color: 'text-blue-400', iconKind: 'doc' }
  if (['txt', 'md', 'log', 'rtf'].includes(e))
    return { label: 'Text', color: 'text-zinc-400', iconKind: 'text' }
  if (e === 'pdf')
    return { label: 'PDF', color: 'text-red-400', iconKind: 'doc' }
  return { label: ext.toUpperCase(), color: 'text-zinc-500', iconKind: 'generic' }
}

export const MOCK_USED_GB = 64.2
export const MOCK_TOTAL_TB = 16
