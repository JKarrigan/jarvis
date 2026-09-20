import 'server-only'
import type { Ebook, EbookProgress } from '@/app/_components/media/types'
import { hueFromId } from '@/app/_components/media/artwork'
import { baseUrl, getSession, imageUrl, isJellyfinConfigured, jfGet } from './jellyfinServer'
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
  if (!isJellyfinConfigured()) return new Set()
  try {
    const { userId } = await getSession()
    const data = await jfGet<{ Items: RawBook[] }>(`/Users/${userId}/Items`, {
      Recursive: true, IncludeItemTypes: 'Book', Fields: 'Path', Limit: 2000,
    }, { revalidate: 0 })
    return new Set(data.Items.map(it => folderKey(it.Path)).filter((k): k is string => Boolean(k)))
  } catch {
    return new Set()
  }
}

/** folder key → AudioBook id, for pairing narrations to books. */
async function getNarrations(userId: string): Promise<Map<string, string>> {
  try {
    const data = await jfGet<{ Items: RawBook[] }>(`/Users/${userId}/Items`, {
      Recursive: true, IncludeItemTypes: 'AudioBook', Fields: 'Path', Limit: 2000,
    }, { revalidate: 0 })
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
  }
}

const FIELDS = 'Path,DateCreated,Tags,People'

export async function getEbooks(): Promise<Ebook[]> {
  if (!isJellyfinConfigured()) return []
  try {
    const { userId } = await getSession()
    const narrations = getNarrations(userId)
    const data = await jfGet<{ Items: RawBook[] }>(`/Users/${userId}/Items`, {
      Recursive: true,
      IncludeItemTypes: 'Book',
      Fields: FIELDS,
      SortBy: 'SortName',
      EnableImageTypes: 'Primary',
      ImageTypeLimit: 1,
      Limit: 2000,
    }, { revalidate: 0 })
    // The Books library also indexes EPUB/CBZ; this reader only opens PDFs.
    const map = await narrations
    return data.Items.filter(it => !it.Path || /\.pdf$/i.test(it.Path)).map(it => toEbook(it, map))
  } catch {
    return []
  }
}

export async function getEbook(id: string): Promise<Ebook | null> {
  if (!isJellyfinConfigured()) return null
  try {
    const { userId } = await getSession()
    const it = await jfGet<RawBook & { Type?: string }>(`/Users/${userId}/Items/${id}`, { Fields: FIELDS }, { revalidate: 0 })
    return it.Type === 'Book' ? toEbook(it, await getNarrations(userId)) : null
  } catch {
    return null
  }
}

export function saveEbookProgress(id: string, p: EbookProgress): void {
  setSetting(progressKey(id), JSON.stringify({ page: p.page, pages: p.pages, rtl: p.rtl, at: Date.now() } satisfies StoredProgress))
}

/** The PDF bytes, proxied so the Jellyfin token stays server-side. Range is passed
    through: pdf.js fetches the pages it needs rather than the whole file. */
export async function fetchEbookFile(id: string, range: string | null): Promise<Response | null> {
  if (!isJellyfinConfigured()) return null
  const { accessToken } = await getSession()
  const res = await fetch(`${baseUrl()}/Items/${id}/Download?api_key=${accessToken}`, {
    headers: range ? { Range: range } : {},
    cache: 'no-store',
  })
  return res.ok || res.status === 206 ? res : null
}

/** Save a rendered page-1 JPEG as the item's Primary image, so Jellyfin serves (and
    resizes) the cover from then on — in this app and in Jellyfin's own clients. */
export async function saveEbookCover(id: string, jpeg: ArrayBuffer): Promise<boolean> {
  if (!isJellyfinConfigured()) return false
  try {
    const { accessToken } = await getSession()
    const res = await fetch(`${baseUrl()}/Items/${id}/Images/Primary?api_key=${accessToken}`, {
      method: 'POST',
      // Jellyfin's image upload takes the file base64-encoded in the body.
      headers: { 'Content-Type': 'image/jpeg' },
      body: Buffer.from(jpeg).toString('base64'),
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  }
}
