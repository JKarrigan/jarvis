import 'server-only'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import type { ApiEntry, SearchResult } from '@/lib/fileTypes'

export const FILES_ROOT = process.env.FILES_ROOT ?? '/mnt/storage'

export function resolveSafe(relPath: string): string {
  const normalized = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '')
  const abs = path.join(FILES_ROOT, normalized)
  if (!abs.startsWith(FILES_ROOT + path.sep) && abs !== FILES_ROOT) {
    throw new Error('Path traversal detected')
  }
  return abs
}

export function listDirectory(relPath: string): ApiEntry[] {
  const abs = resolveSafe(relPath)
  const dirents = fs.readdirSync(abs, { withFileTypes: true })
  const entries: ApiEntry[] = []

  for (const dirent of dirents) {
    if (dirent.name.startsWith('.')) continue
    try {
      const entryAbs = path.join(abs, dirent.name)
      const stat = fs.statSync(entryAbs)
      if (dirent.isDirectory()) {
        let childCount = 0
        try {
          childCount = fs.readdirSync(entryAbs).filter(n => !n.startsWith('.')).length
        } catch { /* ignore */ }
        entries.push({
          name: dirent.name,
          kind: 'dir',
          modified: stat.mtime.toISOString(),
          childCount,
        })
      } else if (dirent.isFile()) {
        const ext = path.extname(dirent.name).slice(1)
        entries.push({
          name: dirent.name,
          kind: 'file',
          size: stat.size,
          modified: stat.mtime.toISOString(),
          ext,
        })
      }
    } catch {
      // skip entries we can't stat
    }
  }

  return entries
}

export function getDiskInfo(mountPath: string): { usedBytes: number; totalBytes: number } {
  try {
    const out = execSync(`df -B1 "${mountPath}"`, { encoding: 'utf8', timeout: 3000 })
    const line = out.trim().split('\n')[1]
    const parts = line.split(/\s+/)
    return {
      totalBytes: parseInt(parts[1], 10),
      usedBytes: parseInt(parts[2], 10),
    }
  } catch {
    return { usedBytes: 0, totalBytes: 0 }
  }
}

export function deleteEntry(relPath: string): void {
  const abs = resolveSafe(relPath)
  fs.rmSync(abs, { recursive: true, force: true })
}

export function createDirectory(relPath: string): void {
  const abs = resolveSafe(relPath)
  fs.mkdirSync(abs, { recursive: true })
}

export function moveEntry(fromRel: string, toDirRel: string): void {
  const absFrom = resolveSafe(fromRel)
  const absToDir = resolveSafe(toDirRel)
  const dest = path.join(absToDir, path.basename(absFrom))
  if (!dest.startsWith(FILES_ROOT)) throw new Error('Path traversal detected')
  fs.renameSync(absFrom, dest)
}

export function renameEntry(relPath: string, newName: string): void {
  if (!newName || newName.includes('/') || newName.includes('\\') || newName === '.' || newName === '..') {
    throw new Error('Invalid name')
  }
  const abs = resolveSafe(relPath)
  const dest = path.join(path.dirname(abs), newName)
  if (!dest.startsWith(FILES_ROOT)) throw new Error('Path traversal detected')
  fs.renameSync(abs, dest)
}

export function searchEntries(rootRel: string, query: string): SearchResult[] {
  const abs = resolveSafe(rootRel)
  const lowerQ = query.toLowerCase()
  const results: SearchResult[] = []

  function walk(dir: string, depth: number) {
    if (depth > 6 || results.length >= 200) return
    let dirents: fs.Dirent[]
    try { dirents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const dirent of dirents) {
      if (dirent.name.startsWith('.')) continue
      const entAbs = path.join(dir, dirent.name)
      if (dirent.name.toLowerCase().includes(lowerQ)) {
        try {
          const stat = fs.statSync(entAbs)
          const relPath = path.relative(FILES_ROOT, entAbs)
          if (dirent.isDirectory()) {
            let childCount = 0
            try { childCount = fs.readdirSync(entAbs).filter(n => !n.startsWith('.')).length } catch { /* ignore */ }
            results.push({ name: dirent.name, kind: 'dir', modified: stat.mtime.toISOString(), childCount, relPath })
          } else if (dirent.isFile()) {
            const ext = path.extname(dirent.name).slice(1)
            results.push({ name: dirent.name, kind: 'file', size: stat.size, modified: stat.mtime.toISOString(), ext, relPath })
          }
        } catch { /* skip unreadable */ }
      }
      if (dirent.isDirectory()) walk(entAbs, depth + 1)
    }
  }

  walk(abs, 0)
  return results
}
