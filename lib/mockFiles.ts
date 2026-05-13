export type { FileEntry, DirEntry, Entry, SortKey, FileTypeInfo } from '@/lib/fileTypes'
export { sortEntries, formatSize, formatDate, fileTypeInfo } from '@/lib/fileTypes'

import type { DirEntry } from '@/lib/fileTypes'

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

export function getEntries(path: string[]): DirEntry['children'] {
  let node: DirEntry = ROOT
  for (const seg of path) {
    const next = node.children.find((e): e is DirEntry => e.kind === 'dir' && e.name === seg)
    if (!next) return []
    node = next
  }
  return node.children
}

export const MOCK_USED_GB = 64.2
export const MOCK_TOTAL_TB = 16
