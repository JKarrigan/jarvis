import 'server-only'
import { execFile } from 'node:child_process'
import type { Audiobook, AudiobookChapter, AudiobookDetail, AudiobookEdit, AudiobookPlayback } from '@/app/_components/media/types'
import { hueFromId } from '@/app/_components/media/artwork'
import {
  BROWSER_PROFILE, baseUrl, fmtBytes, getSession, imageUrl, isJellyfinConfigured,
  jfDelete, jfGet, jfPost, qs, withApiKey,
} from './jellyfinServer'
import { getSetting, setSetting } from './db'
import { folderKey, getBookFolderKeys } from './jellyfinBooks'

// ---------------------------------------------------------------------------
// Audiobooks. A Jellyfin "Books" library surfaces each M4B as one AudioBook item
// (MediaType Audio), so a book has a single resume position. Chapter markers should
// arrive under `Chapters`, but 10.11 omits them — see the ffprobe fallback below. Kept apart from the ReelTitle (movie/tv) model on
// purpose — nothing here flows through the picker, stats or collections.
// ---------------------------------------------------------------------------

const TICKS_PER_SECOND = 10_000_000
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe'

interface RawAudiobook {
  Id: string
  Name: string
  Path?: string
  Album?: string
  AlbumArtist?: string
  Artists?: string[]
  ProductionYear?: number
  RunTimeTicks?: number
  DateCreated?: string
  Overview?: string
  Genres?: string[]
  ImageTags?: { Primary?: string }
  People?: { Name: string; Type?: string }[]
  Chapters?: { StartPositionTicks?: number; Name?: string }[]
  UserData?: { PlaybackPositionTicks?: number; Played?: boolean; IsFavorite?: boolean; LastPlayedDate?: string }
  MediaSources?: {
    Container?: string
    Size?: number
    Bitrate?: number
    MediaStreams?: { Type: string; Codec?: string; ChannelLayout?: string; BitRate?: number }[]
  }[]
}

const LIST_FIELDS = 'DateCreated,ProductionYear,RunTimeTicks,People,Path'

function ms(iso?: string): number | undefined {
  if (!iso) return undefined
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? undefined : t
}

function toAudiobook(it: RawAudiobook): Audiobook {
  // Audiobook tagging convention: album artist = author, composer = narrator.
  const narrator = it.People?.find(p => p.Type === 'Narrator' || p.Type === 'Composer')?.Name
  return {
    id: it.Id,
    title: it.Album || it.Name,
    author: it.AlbumArtist || it.Artists?.[0] || undefined,
    narrator,
    year: it.ProductionYear,
    duration: (it.RunTimeTicks ?? 0) / TICKS_PER_SECOND,
    position: (it.UserData?.PlaybackPositionTicks ?? 0) / TICKS_PER_SECOND,
    finished: Boolean(it.UserData?.Played),
    favorite: Boolean(it.UserData?.IsFavorite),
    lastPlayedAt: ms(it.UserData?.LastPlayedDate),
    addedAt: ms(it.DateCreated),
    hue: hueFromId(it.Id),
    coverUrl: it.ImageTags?.Primary
      ? imageUrl(it.Id, 'Primary', { tag: it.ImageTags.Primary, maxWidth: 640 })
      : undefined,
  }
}

/** Chapter markers → start/duration pairs. A file with no markers is one chapter. */
function toChapters(it: RawAudiobook, duration: number): AudiobookChapter[] {
  const starts = (it.Chapters ?? [])
    .map(c => ({ start: (c.StartPositionTicks ?? 0) / TICKS_PER_SECOND, name: c.Name?.trim() }))
    .sort((a, b) => a.start - b.start)
  if (starts.length === 0) return [{ index: 0, title: it.Album || it.Name, start: 0, duration }]
  return starts.map((c, i) => ({
    index: i,
    title: c.name || `Chapter ${i + 1}`,
    start: c.start,
    duration: Math.max(0, (starts[i + 1]?.start ?? duration) - c.start),
  }))
}

// ── Chapter fallback ──
// Jellyfin 10.11 doesn't extract chapter markers for AudioBook items (the item has no
// `Chapters` at all, though the M4B carries a chapter track), so read them ourselves:
// ffprobe over the same Direct Play stream the player uses. It only fetches the file's
// index, needs no NAS↔Pi path mapping, and the result is cached in SQLite per file.
// Once a Jellyfin release returns `Chapters`, toChapters() wins and this goes unused.

/** "Book Title - Track 001" → "Track 1": drop the repeated book name and zero padding. */
function cleanChapterTitle(raw: string | undefined, bookTitle: string, n: number): string {
  let t = (raw ?? '').trim()
  if (bookTitle && t.toLowerCase().startsWith(bookTitle.toLowerCase())) {
    t = t.slice(bookTitle.length).replace(/^[\s\-–—:·.]+/, '')
  }
  t = t.replace(/\b0+(\d)/g, '$1')
  return t || `Chapter ${n}`
}

function ffprobeChapters(url: string): Promise<{ start: number; end: number; title?: string }[]> {
  return new Promise((resolve, reject) => {
    execFile(
      FFPROBE,
      ['-v', 'error', '-print_format', 'json', '-show_chapters', url],
      { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        // Never surface err.message — it echoes the command line, token included.
        if (err) return reject(new Error('ffprobe failed'))
        try {
          const parsed = JSON.parse(stdout) as { chapters?: { start_time?: string; end_time?: string; tags?: { title?: string } }[] }
          resolve((parsed.chapters ?? []).map(c => ({
            start: Number(c.start_time ?? 0),
            end: Number(c.end_time ?? 0),
            title: c.tags?.title,
          })))
        } catch {
          reject(new Error('ffprobe output unreadable'))
        }
      },
    )
  })
}

async function probedChapters(it: RawAudiobook, duration: number): Promise<AudiobookChapter[] | null> {
  const src = it.MediaSources?.[0]
  // Size in the key: a re-ripped or re-tagged file gets probed again.
  const key = `audiobook.chapters.${it.Id}.${src?.Size ?? 0}`
  const cached = getSetting(key)
  if (cached) {
    try { return JSON.parse(cached) as AudiobookChapter[] } catch { /* re-probe below */ }
  }
  try {
    const { accessToken } = await getSession()
    const container = src?.Container?.split(',')[0] || 'm4b'
    const raw = await ffprobeChapters(`${baseUrl()}/Audio/${it.Id}/stream.${container}${qs({ static: true, api_key: accessToken })}`)
    if (raw.length < 2) return null
    const title = it.Album || it.Name
    const chapters = raw
      .sort((a, b) => a.start - b.start)
      .map((c, i) => ({
        index: i,
        title: cleanChapterTitle(c.title, title, i + 1),
        start: c.start,
        duration: Math.max(0, (raw[i + 1]?.start ?? (c.end || duration)) - c.start),
      }))
    setSetting(key, JSON.stringify(chapters))
    return chapters
  } catch {
    // ffprobe missing / stream unreachable: the book still plays as one long chapter.
    return null
  }
}

// ── Chapter names ──
// Files often carry useless marker names ("Track 001"). Real names are entered in the
// app and kept here, keyed by book — they survive a re-probe and never touch the file.

const chapterNamesKey = (id: string) => `audiobook.chapterTitles.${id}`

function withChapterNames(id: string, chapters: AudiobookChapter[]): AudiobookChapter[] {
  let names: string[] = []
  try { names = JSON.parse(getSetting(chapterNamesKey(id)) ?? '[]') as string[] } catch { /* ignore a corrupt row */ }
  return chapters.map((c, i) => {
    const name = names[i]?.trim()
    return name && name !== c.title ? { ...c, title: name, fileTitle: c.title } : c
  })
}

function toDetail(it: RawAudiobook): AudiobookDetail {
  const book = toAudiobook(it)
  const src = it.MediaSources?.[0]
  const audio = src?.MediaStreams?.find(s => s.Type === 'Audio')
  const kbps = audio?.BitRate ?? src?.Bitrate
  return {
    ...book,
    synopsis: it.Overview,
    genres: it.Genres ?? [],
    chapters: toChapters(it, book.duration),
    file: src && {
      container: src.Container?.split(',')[0]?.toUpperCase(),
      audio: [audio?.Codec?.toUpperCase(), audio?.ChannelLayout, kbps ? `${Math.round(kbps / 1000)} kbps` : undefined]
        .filter(Boolean).join(' · ') || undefined,
      size: fmtBytes(src.Size),
    },
  }
}

// ── Mock mode (no JELLYFIN_* vars): enough to render the section in dev ──

const MOCK_BOOKS: { title: string; author: string; narrator: string; hours: number; chapters: number; at?: number; done?: boolean }[] = [
  { title: 'Project Hail Mary', author: 'Andy Weir', narrator: 'Ray Porter', hours: 16.17, chapters: 30, at: 0.58 },
  { title: 'The Hobbit', author: 'J.R.R. Tolkien', narrator: 'Andy Serkis', hours: 10.42, chapters: 19, at: 0.5 },
  { title: 'Piranesi', author: 'Susanna Clarke', narrator: 'Chiwetel Ejiofor', hours: 6.97, chapters: 7, at: 0.62 },
  { title: 'Dune', author: 'Frank Herbert', narrator: 'Scott Brick', hours: 21.03, chapters: 48, done: true },
  { title: 'Children of Time', author: 'Adrian Tchaikovsky', narrator: 'Mel Hudson', hours: 16.52, chapters: 40 },
  { title: 'Circe', author: 'Madeline Miller', narrator: 'Perdita Weeks', hours: 12.13, chapters: 27 },
  { title: 'The Martian', author: 'Andy Weir', narrator: 'Wil Wheaton', hours: 10.98, chapters: 26, done: true },
  { title: 'A Wizard of Earthsea', author: 'Ursula K. Le Guin', narrator: 'Rob Inglis', hours: 7.13, chapters: 10 },
]

function mockDetail(i: number): AudiobookDetail {
  const b = MOCK_BOOKS[i]
  const id = `mock-book-${i}`
  const duration = Math.round(b.hours * 3600)
  // Uneven chapter lengths so the segmented progress bar looks like a real book.
  const weights = Array.from({ length: b.chapters }, (_, c) => 0.8 + ((c * 37 + i * 11) % 9) / 20)
  const total = weights.reduce((a, w) => a + w, 0)
  let start = 0
  const chapters = weights.map((w, c) => {
    const len = (w / total) * duration
    const ch = { index: c, title: `Chapter ${c + 1}`, start, duration: len }
    start += len
    return ch
  })
  return {
    id, title: b.title, author: b.author, narrator: b.narrator,
    duration, position: b.at ? duration * b.at : 0, finished: Boolean(b.done), favorite: false,
    lastPlayedAt: b.at ? Date.now() - i * 86_400_000 : undefined,
    addedAt: Date.now() - (i + 1) * 3 * 86_400_000,
    hue: hueFromId(b.title), genres: [], chapters,
    file: { container: 'M4B', audio: 'AAC · stereo' },
  }
}

function mockIndex(id: string): number {
  const i = Number(id.replace('mock-book-', ''))
  return Number.isInteger(i) && MOCK_BOOKS[i] ? i : -1
}

// ── Queries ──

export async function getAudiobooks(): Promise<Audiobook[]> {
  if (!isJellyfinConfigured()) return MOCK_BOOKS.map((_, i) => mockDetail(i))
  try {
    const { userId } = await getSession()
    const bookFolders = getBookFolderKeys()
    // Uncached: resume positions move every few seconds while a book is playing.
    const data = await jfGet<{ Items: RawAudiobook[] }>(`/Users/${userId}/Items`, {
      Recursive: true,
      IncludeItemTypes: 'AudioBook',
      Fields: LIST_FIELDS,
      SortBy: 'DateCreated',
      SortOrder: 'Descending',
      EnableImageTypes: 'Primary',
      ImageTypeLimit: 1,
      Limit: 1000,
    }, { revalidate: 0 })
    // A short narration that accompanies a readable book (same Author/Title path) belongs
    // to that book's reader, not on the Listen shelf next to 20-hour audiobooks.
    const readable = await bookFolders
    return data.Items.filter(it => { const k = folderKey(it.Path); return !k || !readable.has(k) }).map(toAudiobook)
  } catch {
    return []
  }
}

export async function getAudiobook(id: string): Promise<AudiobookDetail | null> {
  if (!isJellyfinConfigured()) {
    const i = mockIndex(id)
    return i < 0 ? null : mockDetail(i)
  }
  try {
    const { userId } = await getSession()
    const it = await jfGet<RawAudiobook & { Type?: string }>(`/Users/${userId}/Items/${id}`, {}, { revalidate: 0 })
    if (it.Type !== 'AudioBook') return null
    const detail = toDetail(it)
    if (!it.Chapters?.length) {
      const probed = await probedChapters(it, detail.duration)
      if (probed) detail.chapters = probed
    }
    detail.chapters = withChapterNames(id, detail.chapters)
    return detail
  } catch {
    return null
  }
}

/** Resolve a stream for the <audio> element. M4B/AAC and MP3 Direct Play (original
    bytes, range-seekable); anything else falls back to Jellyfin's audio transcode. */
export async function getAudiobookPlayback(id: string): Promise<AudiobookPlayback | null> {
  if (!isJellyfinConfigured()) return null
  const { userId, accessToken } = await getSession()
  const res = await jfPost(`/Items/${id}/PlaybackInfo`, { UserId: userId, DeviceProfile: BROWSER_PROFILE }, { userId })
  if (!res.ok) return null
  const info = (await res.json()) as {
    PlaySessionId: string
    MediaSources?: { Id: string; Container?: string; SupportsDirectPlay?: boolean; TranscodingUrl?: string }[]
  }
  const src = info.MediaSources?.[0]
  if (!src) return null
  const common = { itemId: id, mediaSourceId: src.Id, playSessionId: info.PlaySessionId }
  if (src.SupportsDirectPlay || !src.TranscodingUrl) {
    const container = src.Container?.split(',')[0] || 'm4b'
    return {
      ...common,
      transcoding: false,
      playMethodLabel: 'Direct Play',
      url: `${baseUrl()}/Audio/${id}/stream.${container}${qs({
        static: true, mediaSourceId: src.Id, api_key: accessToken, PlaySessionId: info.PlaySessionId,
      })}`,
    }
  }
  return { ...common, transcoding: true, playMethodLabel: 'Transcoding', url: withApiKey(src.TranscodingUrl, accessToken) }
}

/** Mark a book finished (true) or unplayed (false — also clears its resume position). */
export async function setAudiobookFinished(id: string, finished: boolean): Promise<boolean> {
  if (!isJellyfinConfigured()) return true
  try {
    const { userId } = await getSession()
    const res = finished
      ? await jfPost(`/Users/${userId}/PlayedItems/${id}`)
      : await jfDelete(`/Users/${userId}/PlayedItems/${id}`)
    return res.ok
  } catch {
    return false
  }
}

/** Save edited details. Chapter names stay in this app's DB; the rest is written to the
    Jellyfin item the same way the dashboard's "Edit metadata" form does (fetch the full
    item, change fields, post it back) — the file on the NAS is never modified. */
export async function updateAudiobook(id: string, edit: AudiobookEdit): Promise<boolean> {
  if (edit.chapterTitles) {
    setSetting(chapterNamesKey(id), JSON.stringify(edit.chapterTitles.map(t => t.trim().slice(0, 200))))
  }
  const touchesJellyfin = edit.narrator !== undefined || edit.year !== undefined || edit.synopsis !== undefined
  if (!touchesJellyfin || !isJellyfinConfigured()) return true
  try {
    const { userId } = await getSession()
    const item = await jfGet<Record<string, unknown> & { Type?: string; People?: { Name: string; Type?: string; Role?: string }[] }>(
      `/Users/${userId}/Items/${id}`, {}, { revalidate: 0 },
    )
    if (item.Type !== 'AudioBook') return false
    if (edit.synopsis !== undefined) item.Overview = edit.synopsis.trim()
    if (edit.year !== undefined) item.ProductionYear = edit.year
    if (edit.narrator !== undefined) {
      // Jellyfin has no "Narrator" person kind; Composer + Role is the audiobook convention.
      const others = (item.People ?? []).filter(p => p.Type !== 'Composer' && p.Type !== 'Narrator')
      const name = edit.narrator.trim()
      item.People = name ? [...others, { Name: name, Type: 'Composer', Role: 'Narrator' }] : others
    }
    const res = await jfPost(`/Items/${id}`, item)
    return res.ok
  } catch {
    return false
  }
}
