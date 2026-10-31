import 'server-only'
import type { Ebook, EbookProgress, NarrationSync } from '@/app/_components/media/types'
import { hueFromId } from '@/app/_components/media/artwork'
import { cache } from 'react'
import { getSession, imageUrl, isItemId, isMockMode, isNotFound, jfFetch, jfJson } from './jellyfinServer'
import { getSetting, setSetting } from './db'

// ---------------------------------------------------------------------------
// Readable books (PDF). For Book items Jellyfin is little more than a file index:
// it supplies the title (from the file name) and the bytes, but no cover, no author
// and no usable reading progress. So the author falls back to the library's
// Author/Title/Title.pdf folder layout, covers are rendered from page 1 by the client
// and saved back onto the Jellyfin item, and the reading position lives in this
// app's settings table.
//
// Narration: Jellyfin resolves a `Title/` folder to the Book and ignores an MP3 sitting
// next to the PDF, so a book's read-along audio lives in the *Audiobooks* library under
// the same `Author/Title/` path and the two are paired here by that path.
// ---------------------------------------------------------------------------

interface RawBook {
  Id: string
  Name: string
  Path?: string
  DateCreated?: string
  Tags?: string[]
  ImageTags?: { Primary?: string }
  People?: { Name: string; Type?: string }[]
}

interface StoredProgress extends EbookProgress { at: number }

const progressKey = (id: string) => `book.progress.${id}`
const syncKey = (id: string) => `book.sync.${id}`
/** Small "has timings" flag, so listing books never reads the multi-MB timings blobs. */
const syncedKey = (id: string) => `book.synced.${id}`

function hasSync(id: string): boolean {
  const flag = getSetting(syncedKey(id))
  if (flag != null) return flag === '1'
  // Timings uploaded before the flag existed: look once, then remember.
  const has = getSetting(syncKey(id)) != null
  try { setSetting(syncedKey(id), has ? '1' : '0') } catch { /* ignore */ }
  return has
}

function readProgress(id: string): StoredProgress | null {
  try {
    const raw = getSetting(progressKey(id))
    return raw ? (JSON.parse(raw) as StoredProgress) : null
  } catch {
    return null
  }
}

/** `…/Author/Title/file.ext` → `author/title` (NFC, case-folded): the key a book and its narration share. */
export function folderKey(path?: string): string | undefined {
  const parts = path?.split('/') ?? []
  if (parts.length < 3) return undefined
  return `${parts[parts.length - 3]}/${parts[parts.length - 2]}`.normalize('NFC').toLowerCase()
}

/** Folder keys of every readable book — lets the Listen shelf leave their narrations out. */
export async function getBookFolderKeys(): Promise<Set<string>> {
  if (isMockMode()) return new Set()
  try {
    const { userId } = await getSession()
    const data = await jfJson<{ Items: RawBook[] }>(`/Users/${encodeURIComponent(userId)}/Items`, {
      params: { Recursive: true, IncludeItemTypes: 'Book', Fields: 'Path', Limit: 5000 },
    })
    return new Set(data.Items.map(it => folderKey(it.Path)).filter((k): k is string => Boolean(k)))
  } catch {
    return new Set()
  }
}

/** folder key → AudioBook id, for pairing narrations to books. */
async function getNarrations(userId: string): Promise<Map<string, string>> {
  try {
    const data = await jfJson<{ Items: RawBook[] }>(`/Users/${encodeURIComponent(userId)}/Items`, {
      params: { Recursive: true, IncludeItemTypes: 'AudioBook', Fields: 'Path', Limit: 5000 },
    })
    const map = new Map<string, string>()
    for (const it of data.Items) {
      const key = folderKey(it.Path)
      if (key && !map.has(key)) map.set(key, it.Id)
    }
    return map
  } catch {
    return new Map()
  }
}

function toEbook(it: RawBook, narrations: Map<string, string>): Ebook {
  const progress = readProgress(it.Id)
  const key = folderKey(it.Path)
  // …/Author/Title/Title.pdf → the author is the grandparent folder.
  const folders = it.Path?.split('/') ?? []
  const folderAuthor = folders.length >= 3 ? folders[folders.length - 3] : undefined
  const tags = it.Tags ?? []
  const level = tags.map(t => /^level\s*(\d+)$/i.exec(t)?.[1]).find(Boolean)
  const added = it.DateCreated ? new Date(it.DateCreated).getTime() : NaN
  return {
    id: it.Id,
    title: it.Name,
    author: it.People?.find(p => p.Type === 'Author')?.Name ?? folderAuthor,
    level: level ? Number(level) : undefined,
    tags,
    addedAt: Number.isNaN(added) ? undefined : added,
    hue: hueFromId(it.Id),
    coverUrl: it.ImageTags?.Primary ? imageUrl(it.Id, 'Primary', { tag: it.ImageTags.Primary, maxWidth: 480 }) : undefined,
    page: progress?.page,
    pages: progress?.pages,
    finished: Boolean(progress && progress.pages > 0 && progress.page >= progress.pages),
    readAt: progress?.at,
    rtl: progress?.rtl,
    audioId: key ? narrations.get(key) : undefined,
    synced: hasSync(it.Id),
  }
}

const FIELDS = 'Path,DateCreated,Tags,People'

/** Every readable (PDF) book. Throws when Jellyfin is unreachable. Deduped per render. */
export const getEbooks = cache(async (): Promise<Ebook[]> => {
  if (isMockMode()) return []
  const { userId } = await getSession()
  const narrations = getNarrations(userId)
  const data = await jfJson<{ Items: RawBook[] }>(`/Users/${encodeURIComponent(userId)}/Items`, {
    params: {
      Recursive: true,
      IncludeItemTypes: 'Book',
      Fields: FIELDS,
      SortBy: 'SortName',
      EnableImageTypes: 'Primary',
      ImageTypeLimit: 1,
      Limit: 5000,
    },
  })
  // The Books library also indexes EPUB/CBZ; this reader only opens PDFs.
  const map = await narrations
  return data.Items.filter(it => !it.Path || /\.pdf$/i.test(it.Path)).map(it => toEbook(it, map))
})

/** One book. null → not found / not a Book; throws when Jellyfin is unreachable. */
export const getEbook = cache(async (id: string): Promise<Ebook | null> => {
  if (isMockMode() || !isItemId(id)) return null
  let it: RawBook & { Type?: string }
  let userId: string
  try {
    userId = (await getSession()).userId
    it = await jfJson<RawBook & { Type?: string }>(`/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(id)}`, { params: { Fields: FIELDS } })
  } catch (e) {
    if (isNotFound(e)) return null
    throw e
  }
  if (it.Type === 'Book') bookIds.add(id)
  return it.Type === 'Book' ? toEbook(it, await getNarrations(userId)) : null
})

/** Ids confirmed to be Book items (the file proxy must not serve arbitrary items). */
const bookIds = new Set<string>()

async function isBook(id: string): Promise<boolean> {
  if (bookIds.has(id)) return true
  const { userId } = await getSession()
  const it = await jfJson<{ Type?: string }>(`/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(id)}`).catch(() => null)
  if (it?.Type !== 'Book') return false
  bookIds.add(id)
  return true
}

export function saveEbookProgress(id: string, p: EbookProgress): void {
  setSetting(progressKey(id), JSON.stringify({ page: p.page, pages: p.pages, rtl: p.rtl, at: Date.now() } satisfies StoredProgress))
}

/** The PDF bytes, proxied so the Jellyfin token stays server-side. Range is passed
    through (pdf.js fetches the pages it needs) and so is the caller's abort signal. */
export async function fetchEbookFile(id: string, range: string | null, signal?: AbortSignal): Promise<Response | null> {
  if (isMockMode() || !isItemId(id)) return null
  if (!(await isBook(id))) return null
  const res = await jfFetch(`/Items/${encodeURIComponent(id)}/Download`, {
    headers: { Accept: '*/*', 'Accept-Encoding': 'identity', ...(range ? { Range: range } : {}) },
    signal,
    stream: true,
  })
  return res.ok || res.status === 206 ? res : null
}

/** Save a rendered page-1 JPEG as the item's Primary image, so Jellyfin serves (and
    resizes) the cover from then on — in this app and in Jellyfin's own clients. */
export async function saveEbookCover(id: string, jpeg: ArrayBuffer): Promise<boolean> {
  if (isMockMode()) return false
  try {
    const res = await jfFetch(`/Items/${encodeURIComponent(id)}/Images/Primary`, {
      method: 'POST',
      // Jellyfin's image upload takes the file base64-encoded in the body.
      headers: { 'Content-Type': 'image/jpeg' },
      body: Buffer.from(jpeg).toString('base64'),
      timeoutMs: 30_000,
    })
    return res.ok
  } catch {
    return false
  }
}

/** Narration timings, produced offline by scripts/sync-narration.py and kept in this app's DB. */
export function getNarrationSync(id: string): NarrationSync | null {
  try {
    const raw = getSetting(syncKey(id))
    return raw ? (JSON.parse(raw) as NarrationSync) : null
  } catch {
    return null
  }
}

export function saveNarrationSync(id: string, sync: NarrationSync): void {
  setSetting(syncKey(id), JSON.stringify(sync))
  setSetting(syncedKey(id), '1')
}
