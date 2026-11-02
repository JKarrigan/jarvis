// Pure helpers behind the upload queue and the listing it patches: folder-drop
// tree walking and path mapping, in-place placeholders, and merging optimistic
// entries with a background refetch. React-free so tests can drive them.

import { joinPath, parentOf, type DocItem } from './api'
import { isHiddenName } from './fileKinds'
import { sortItems, type Sort } from './selection'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// --- folder drops ------------------------------------------------------------------

/** A file from a drop, with the folder it sat in relative to the drop ('' = dropped loose). */
export interface DroppedFile<F> { file: F; relDir: string }

/** What a drop holds: files (with their relative folders) and every folder, empty ones too. */
export interface DropTree<F> { files: DroppedFile<F>[]; dirs: string[] }

/**
 * The subset of the File and Directory Entries API a drop walk needs
 * (`DataTransferItem.webkitGetAsEntry()`), structural so tests can stub it.
 */
export interface EntryLike {
  name: string
  isFile: boolean
  isDirectory: boolean
}
export interface FileEntryLike<F> extends EntryLike {
  file: (success: (file: F) => void, failure?: (err: unknown) => void) => void
}
export interface DirectoryEntryLike extends EntryLike {
  createReader: () => { readEntries: (success: (entries: EntryLike[]) => void, failure?: (err: unknown) => void) => void }
}

const isFileEntry = <F>(e: EntryLike): e is FileEntryLike<F> => e.isFile && 'file' in e
const isDirEntry = (e: EntryLike): e is DirectoryEntryLike => e.isDirectory && 'createReader' in e

/**
 * Walks dropped entries into files + folders. `readEntries` returns at most ~100 entries
 * per call, so each folder is read until it answers empty. Hidden names (.DS_Store,
 * dot-folders, NAS housekeeping, *.part) are skipped like the server would hide them.
 */
export async function walkEntries<F>(roots: EntryLike[]): Promise<DropTree<F>> {
  const out: DropTree<F> = { files: [], dirs: [] }
  const visit = async (entry: EntryLike, relDir: string): Promise<void> => {
    if (isHiddenName(entry.name)) return
    if (isFileEntry<F>(entry)) {
      const file = await new Promise<F>((resolve, reject) => entry.file(resolve, reject))
      out.files.push({ file, relDir })
      return
    }
    if (!isDirEntry(entry)) return
    const dir = joinPath(relDir, entry.name)
    out.dirs.push(dir)
    const reader = entry.createReader()
    for (;;) {
      const batch = await new Promise<EntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject))
      if (batch.length === 0) break
      for (const child of batch) await visit(child, dir)
    }
  }
  for (const root of roots) await visit(root, '')
  return out
}

export interface PlannedUpload<F> { file: F; dir: string; name: string }

/**
 * Maps a drop (or a plain file pick: every `relDir` '') under `target`: the folders to
 * create, parents first, and the uploads sorted by folder (tree order) then name, so a
 * folder fills in name order and the queue walks the tree predictably.
 */
export function planUploads<F extends { name: string }>(target: string, tree: DropTree<F>): { dirs: string[]; uploads: PlannedUpload<F>[] } {
  const dirs = new Set<string>()
  const addDir = (rel: string) => {
    const parts = rel.split('/').filter(Boolean)
    for (let i = 1; i <= parts.length; i++) dirs.add(joinPath(target, parts.slice(0, i).join('/')))
  }
  for (const d of tree.dirs) if (!d.split('/').some(isHiddenName)) addDir(d)
  const uploads: PlannedUpload<F>[] = []
  for (const { file, relDir } of tree.files) {
    if (isHiddenName(file.name) || relDir.split('/').filter(Boolean).some(isHiddenName)) continue
    if (relDir) addDir(relDir)
    uploads.push({ file, dir: relDir ? joinPath(target, relDir.split('/').filter(Boolean).join('/')) : target, name: file.name })
  }
  const depth = (p: string) => (p ? p.split('/').length : 0)
  const orderedDirs = [...dirs].sort((a, b) => depth(a) - depth(b) || collator.compare(a, b))
  uploads.sort((a, b) => compareDirs(a.dir, b.dir) || collator.compare(a.name, b.name))
  return { dirs: orderedDirs, uploads }
}

/** Tree order: a folder's own files before its subfolders' (segment by segment). */
function compareDirs(a: string, b: string): number {
  if (a === b) return 0
  const pa = a ? a.split('/') : []
  const pb = b ? b.split('/') : []
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const c = collator.compare(pa[i], pb[i])
    if (c) return c
  }
  return pa.length - pb.length
}

// --- placeholders and optimistic patches --------------------------------------------

/** What the listing needs from an upload to draw its placeholder. */
export interface PlaceholderSource {
  id: string
  dir: string
  name: string
  /** Bytes sent so far / the file's size. */
  loaded: number
  total: number
  /** When it was queued (ms) — a placeholder's "modified" so date sorts place it with the newest. */
  addedAt: number
  state: 'queued' | 'uploading' | 'error' | 'done' | 'conflict' | 'cancelled' | 'skipped'
}

/** A listing row: a real item, or an upload in flight drawn in place (`upload` set). */
export type ListEntry = DocItem & { upload?: PlaceholderSource }

const SHOWN: ReadonlySet<PlaceholderSource['state']> = new Set(['queued', 'uploading', 'error'])

export function placeholderItem(u: PlaceholderSource): ListEntry {
  return { path: joinPath(u.dir, u.name), name: u.name, isDir: false, size: u.total, modified: u.addedAt, childCount: 0, parent: u.dir, upload: u }
}

/**
 * The folder's items plus a placeholder for each queued / uploading / failed upload into
 * it, sorted together by the current sort so nothing jumps when a placeholder turns into
 * the stored file (same path, same sort key). A placeholder whose name already exists is
 * left out (it will be a name clash, resolved in the uploads panel), as are duplicates.
 */
export function withPlaceholders(items: readonly DocItem[], uploads: readonly PlaceholderSource[], folder: string, sort: Sort): ListEntry[] {
  const taken = new Set(items.map(i => i.path))
  const extra: ListEntry[] = []
  for (const u of uploads) {
    if (u.dir !== folder || !SHOWN.has(u.state)) continue
    const p = placeholderItem(u)
    if (taken.has(p.path)) continue
    taken.add(p.path)
    extra.push(p)
  }
  if (extra.length === 0) return sortItems(items, sort)
  return sortItems([...items, ...extra], sort)
}

/** A locally known change waiting for a listing that started after it to confirm it. */
export interface PendingItem { item: DocItem; at: number }

/** The stored file as the listing will show it (until the next refetch brings the server's mtime). */
export function storedItem(dir: string, name: string, size: number, modified: number): DocItem {
  return { path: joinPath(dir, name), name, isDir: false, size, modified, childCount: 0, parent: dir }
}

/** A folder made by a folder drop, shown before the refetch. */
export function folderItem(path: string, modified: number): DocItem {
  return { path, name: path.slice(path.lastIndexOf('/') + 1), isDir: true, size: 0, modified, childCount: 0, parent: parentOf(path) }
}

/**
 * A refetched listing merged with optimistic additions. Entries added after the request
 * started (`at >= startedAt`) may be missing from the answer, so they stay; older ones
 * are settled by the server either way and are dropped. Returns the merged items and
 * the pending entries still unconfirmed.
 */
export function mergeListing(server: readonly DocItem[], pending: readonly PendingItem[], startedAt: number): { items: DocItem[]; pending: PendingItem[] } {
  const keep = pending.filter(p => p.at >= startedAt)
  const have = new Set(server.map(i => i.path))
  const items = [...server]
  for (const p of keep) if (!have.has(p.item.path)) items.push(p.item)
  return { items, pending: keep }
}

/** Adds (or replaces, by path) items in a listing. */
export function upsertItems(items: readonly DocItem[], add: readonly DocItem[]): DocItem[] {
  const byPath = new Map(items.map(i => [i.path, i]))
  for (const a of add) {
    const old = byPath.get(a.path)
    // A folder we already list keeps its real counts.
    byPath.set(a.path, old && old.isDir && a.isDir ? old : a)
  }
  return [...byPath.values()]
}
