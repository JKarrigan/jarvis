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

export type ApiFileEntry = {
  name: string
  kind: 'file'
  size: number
  modified: string
  ext: string
}

export type ApiDirEntry = {
  name: string
  kind: 'dir'
  modified: string
  childCount: number
}

export type ApiEntry = ApiFileEntry | ApiDirEntry

export type SortKey = 'name' | 'size' | 'modified'

const KB = 1024
const MB = 1024 * KB
const GB = 1024 * MB

export function sortEntries(entries: ApiEntry[], key: SortKey): ApiEntry[]
export function sortEntries(entries: Entry[], key: SortKey): Entry[]
export function sortEntries(entries: (ApiEntry | Entry)[], key: SortKey): (ApiEntry | Entry)[] {
  const dirs = entries.filter(e => e.kind === 'dir')
  const files = entries.filter(e => e.kind === 'file')

  const getTime = (e: ApiEntry | Entry) => {
    const m = e.modified
    return typeof m === 'string' ? new Date(m).getTime() : (m as Date).getTime()
  }

  const cmp = (a: ApiEntry | Entry, b: ApiEntry | Entry): number => {
    if (key === 'name') return a.name.localeCompare(b.name)
    if (key === 'size') {
      const aSize = a.kind === 'file' ? (a as ApiFileEntry | FileEntry).size : 0
      const bSize = b.kind === 'file' ? (b as ApiFileEntry | FileEntry).size : 0
      return bSize - aSize
    }
    return getTime(b) - getTime(a)
  }

  return [...dirs.sort(cmp), ...files.sort(cmp)]
}

export function formatSize(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`
  if (bytes >= KB) return `${Math.round(bytes / KB)} KB`
  return `${bytes} B`
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export type FileTypeInfo = {
  label: string
  color: string
  iconKind: 'doc' | 'image' | 'video' | 'archive' | 'sheet' | 'text' | 'generic'
}

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
  return { label: ext.toUpperCase() || 'File', color: 'text-zinc-500', iconKind: 'generic' }
}
