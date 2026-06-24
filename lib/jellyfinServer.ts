import 'server-only'
import type { MediaItem } from '@/app/_components/media/MediaCard'
import type { ReelTitle, ContinueItem, FileInfo, ReelDetail, ReelCastMember, CollectionSummary, ReelPerson, ReelPersonEpisode } from '@/app/_components/media/types'
import { hueFromId, poster as posterArt, backdrop as backdropArt } from '@/app/_components/media/artwork'
import {
  MOCK_JELLYFIN_ITEMS,
  type JellyfinItem,
  type JellyfinPerson,
  type JellyfinSeason,
} from './jellyfin'
import { MOCK_MOVIES, MOCK_TV, MOCK_CONTINUE_WATCHING } from '@/app/_components/media/mockData'

// ---------------------------------------------------------------------------
// Config + auth. The Jellyfin server runs on the Synology; this Next.js app (on
// the Pi) authenticates once as a single dashboard user and caches the token on
// `globalThis` (same pattern as lib/poller.ts / lib/db.ts). The admin API key,
// if used, never leaves the server.
// ---------------------------------------------------------------------------

const CLIENT = 'Jarvis'
const DEVICE = 'Raspberry Pi'
const DEVICE_ID = 'jarvis-dashboard'
const VERSION = '1.0.0'

function baseUrl(): string | undefined {
  return process.env.JELLYFIN_URL?.replace(/\/+$/, '')
}

export function isJellyfinConfigured(): boolean {
  return Boolean(
    baseUrl() &&
    (process.env.JELLYFIN_API_KEY ||
      (process.env.JELLYFIN_USER && process.env.JELLYFIN_PASSWORD)),
  )
}

interface JfSession {
  accessToken: string
  userId: string
}

const g = globalThis as typeof globalThis & {
  __ag_jf?: { session: JfSession | null; pending: Promise<JfSession> | null }
}
function store() {
  if (!g.__ag_jf) g.__ag_jf = { session: null, pending: null }
  return g.__ag_jf
}

function authHeader(token = ''): string {
  return `MediaBrowser Client="${CLIENT}", Device="${DEVICE}", DeviceId="${DEVICE_ID}", Version="${VERSION}", Token="${token}"`
}

async function authenticate(): Promise<JfSession> {
  const url = baseUrl()
  if (!url) throw new Error('JELLYFIN_URL not set')

  // API-key mode: the key is the token; resolve a user id for user-scoped calls.
  if (process.env.JELLYFIN_API_KEY) {
    const token = process.env.JELLYFIN_API_KEY
    let userId = process.env.JELLYFIN_USER_ID
    if (!userId) {
      const res = await fetch(`${url}/Users`, {
        headers: { Authorization: authHeader(token), Accept: 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`Jellyfin /Users ${res.status}`)
      const users = (await res.json()) as { Id: string }[]
      userId = users[0]?.Id
      if (!userId) throw new Error('No Jellyfin users found for API-key mode')
    }
    return { accessToken: token, userId }
  }

  // Username/password mode (preferred for a LAN dashboard user).
  const res = await fetch(`${url}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      Accept: 'application/json',
    },
    body: JSON.stringify({ Username: process.env.JELLYFIN_USER, Pw: process.env.JELLYFIN_PASSWORD }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Jellyfin AuthenticateByName ${res.status}`)
  const data = (await res.json()) as { AccessToken: string; User: { Id: string } }
  return { accessToken: data.AccessToken, userId: data.User.Id }
}

async function getSession(): Promise<JfSession> {
  const s = store()
  if (s.session) return s.session
  if (!s.pending) {
    s.pending = authenticate()
      .then(sess => {
        s.session = sess
        s.pending = null
        return sess
      })
      .catch(err => {
        s.pending = null
        throw err
      })
  }
  return s.pending
}

function clearSession() {
  store().session = null
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

type Params = Record<string, string | number | boolean | undefined>
function qs(params: Params): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) usp.set(k, String(v))
  const s = usp.toString()
  return s ? `?${s}` : ''
}

async function jfGet<T>(path: string, params: Params = {}, revalidate = 300): Promise<T> {
  const url = baseUrl()!
  const run = (token: string) =>
    fetch(`${url}${path}${qs(params)}`, {
      headers: { Authorization: authHeader(token), Accept: 'application/json' },
      next: { revalidate },
    })
  let session = await getSession()
  let res = await run(session.accessToken)
  if (res.status === 401) {
    clearSession()
    session = await getSession()
    res = await run(session.accessToken)
  }
  if (!res.ok) throw new Error(`Jellyfin GET ${path} ${res.status}`)
  return res.json() as Promise<T>
}

async function jfPost(path: string, body?: unknown, params: Params = {}): Promise<Response> {
  const url = baseUrl()!
  const session = await getSession()
  return fetch(`${url}${path}${qs(params)}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(session.accessToken),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
}

// ---------------------------------------------------------------------------
// Image URLs + presentational fallbacks
// ---------------------------------------------------------------------------

export function imageUrl(
  id: string,
  type: 'Primary' | 'Backdrop' | 'Logo' = 'Primary',
  opts: { tag?: string; maxWidth?: number; quality?: number } = {},
): string | undefined {
  const url = baseUrl()
  if (!url) return undefined
  return `${url}/Items/${id}/Images/${type}${qs({ tag: opts.tag, maxWidth: opts.maxWidth, quality: opts.quality ?? 90 })}`
}

const POSTER_GRADIENTS = [
  'linear-gradient(135deg, #92400e, #b45309)',
  'linear-gradient(135deg, #1e3a5f, #374151)',
  'linear-gradient(135deg, #1c4a2a, #374151)',
  'linear-gradient(135deg, #4a1c3a, #7c3aed)',
  'linear-gradient(135deg, #1e3a5f, #0e7490)',
  'linear-gradient(135deg, #7f1d1d, #9a3412)',
  'linear-gradient(135deg, #6d28d9, #ec4899)',
  'linear-gradient(135deg, #0c4a6e, #0369a1)',
  'linear-gradient(135deg, #14532d, #166534)',
  'linear-gradient(135deg, #1c1917, #44403c)',
]
function hash(id: string): number {
  return id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}
function fallbackGradient(id: string): string {
  return POSTER_GRADIENTS[hash(id) % POSTER_GRADIENTS.length]
}
function backdropGradient(id: string): string {
  const [from] = POSTER_GRADIENTS[hash(id) % POSTER_GRADIENTS.length].match(/#[0-9a-f]{6}/i) ?? ['#1c1917']
  return `linear-gradient(160deg, ${from} 0%, #1a1a1a 50%, #09090b 100%)`
}

// ---------------------------------------------------------------------------
// Raw Jellyfin shapes (only the fields we read)
// ---------------------------------------------------------------------------

interface RawStream {
  Type: string
  Codec?: string
  Height?: number
  Width?: number
  IsDefault?: boolean
  Channels?: number
  DisplayTitle?: string
}
interface RawMediaSource {
  Id: string
  Container?: string
  Path?: string
  Size?: number
  SupportsDirectPlay?: boolean
  SupportsDirectStream?: boolean
  /** Jellyfin's pre-built HLS transcode/remux URL when the source isn't browser-compatible. */
  TranscodingUrl?: string
  RunTimeTicks?: number
  MediaStreams?: RawStream[]
}
interface RawUserData {
  PlaybackPositionTicks?: number
  PlayedPercentage?: number
  Played?: boolean
  IsFavorite?: boolean
}
interface RawItem {
  Id: string
  Name: string
  Type: string
  OriginalTitle?: string
  ProductionYear?: number
  RunTimeTicks?: number
  Overview?: string
  Genres?: string[]
  Taglines?: string[]
  OfficialRating?: string
  CommunityRating?: number
  CriticRating?: number
  DateCreated?: string
  ChildCount?: number
  RecursiveItemCount?: number
  Status?: 'Ended' | 'Continuing'
  Height?: number
  SeriesName?: string
  SeriesId?: string
  SeasonId?: string
  IndexNumber?: number
  ParentIndexNumber?: number
  ImageTags?: { Primary?: string; Logo?: string }
  BackdropImageTags?: string[]
  Studios?: { Name: string; Id: string }[]
  People?: { Id: string; Name: string; Role?: string; Type?: string; PrimaryImageTag?: string }[]
  MediaSources?: RawMediaSource[]
  UserData?: RawUserData
}

function badgeFor(it: RawItem): string | undefined {
  const h = it.Height ?? it.MediaSources?.[0]?.MediaStreams?.find(s => s.Type === 'Video')?.Height
  if (!h) return undefined
  if (h >= 1400) return '4K'
  if (h >= 700) return 'HD'
  return undefined
}

function toMediaItem(it: RawItem, kind: 'movies' | 'tv'): MediaItem {
  return {
    id: it.Id,
    title: it.Name,
    year: it.ProductionYear,
    badge: badgeFor(it),
    posterColor: fallbackGradient(it.Id),
    posterUrl: it.ImageTags?.Primary
      ? imageUrl(it.Id, 'Primary', { tag: it.ImageTags.Primary, maxWidth: 360 })
      : undefined,
    href: `/media/${kind}/${it.Id}`,
  }
}

function resumeToMediaItem(it: RawItem): MediaItem {
  const isEpisode = it.Type === 'Episode'
  const remainingTicks = (it.RunTimeTicks ?? 0) - (it.UserData?.PlaybackPositionTicks ?? 0)
  const remaining = remainingTicks > 0 ? `${Math.round(remainingTicks / 600_000_000)} min left` : undefined
  const epLabel =
    it.ParentIndexNumber != null && it.IndexNumber != null
      ? `S${it.ParentIndexNumber} E${it.IndexNumber}`
      : undefined
  const subtitle = isEpisode
    ? [it.SeriesName, epLabel, remaining].filter(Boolean).join(' · ')
    : remaining
  return {
    id: it.Id,
    title: isEpisode ? it.SeriesName ?? it.Name : it.Name,
    subtitle: subtitle || undefined,
    badge: 'Resume',
    posterColor: fallbackGradient(it.SeriesId ?? it.Id),
    posterUrl: it.ImageTags?.Primary
      ? imageUrl(it.Id, 'Primary', { tag: it.ImageTags.Primary, maxWidth: 360 })
      : undefined,
    href: isEpisode && it.SeriesId ? `/media/tv/${it.SeriesId}` : `/media/movies/${it.Id}`,
  }
}

// ---------------------------------------------------------------------------
// Reel mappers — richer per-title model (lib/types ReelTitle) used by the
// redesigned media UI. Hue drives gradient art; watched/favorite/progress seed
// from Jellyfin UserData; the client MediaProvider overlays local changes.
// ---------------------------------------------------------------------------

function daysAgo(iso?: string): number | undefined {
  if (!iso) return undefined
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return undefined
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000))
}

function progressOf(it: RawItem): number {
  const ud = it.UserData
  if (ud?.PlayedPercentage != null) return Math.min(1, Math.max(0, ud.PlayedPercentage / 100))
  if (ud?.PlaybackPositionTicks && it.RunTimeTicks) return Math.min(1, ud.PlaybackPositionTicks / it.RunTimeTicks)
  return 0
}

function toReelTitle(it: RawItem, kind: 'movies' | 'tv'): ReelTitle {
  const hue = hueFromId(it.Id)
  const runtimeMin = it.RunTimeTicks ? Math.round(it.RunTimeTicks / 600_000_000) : undefined
  return {
    id: it.Id,
    title: it.Name,
    year: it.ProductionYear,
    type: kind === 'tv' ? 'tv' : 'movie',
    genres: it.Genres ?? [],
    runtime: kind === 'movies' ? runtimeMin : undefined,
    seasons: kind === 'tv' ? it.ChildCount : undefined,
    episodes: kind === 'tv' ? it.RecursiveItemCount : undefined,
    imdb: it.CommunityRating,
    rt: it.CriticRating,
    cert: it.OfficialRating,
    hue,
    added: daysAgo(it.DateCreated),
    progress: progressOf(it),
    watched: Boolean(it.UserData?.Played),
    favorite: Boolean(it.UserData?.IsFavorite),
    badge: badgeFor(it),
    posterUrl: it.ImageTags?.Primary
      ? imageUrl(it.Id, 'Primary', { tag: it.ImageTags.Primary, maxWidth: 360 })
      : undefined,
    backdropUrl: it.BackdropImageTags?.[0]
      ? imageUrl(it.Id, 'Backdrop', { tag: it.BackdropImageTags[0], maxWidth: 1280, quality: 80 })
      : undefined,
    posterColor: posterArt(hue),
    backdropColor: backdropArt(hue),
    synopsis: it.Overview,
  }
}

/** Map a rich mock JellyfinItem (dev / no-server mode) into a ReelTitle. */
function mockToReel(item: JellyfinItem): ReelTitle {
  const hue = hueFromId(item.Id)
  const kind = item.Type === 'Series' ? 'tv' : 'movie'
  return {
    id: item.Id,
    title: item.Name,
    year: item.ProductionYear,
    type: kind,
    genres: item.Genres ?? [],
    runtime: kind === 'movie' && item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600_000_000) : undefined,
    seasons: item.SeasonCount,
    episodes: item.EpisodeCount,
    imdb: item.CommunityRating,
    rt: undefined,
    cert: item.OfficialRating,
    hue,
    added: ((hue % 30) + 1),
    progress: 0,
    watched: false,
    favorite: false,
    posterColor: posterArt(hue),
    backdropColor: backdropArt(hue),
    synopsis: item.Overview,
  }
}

function mockCatalog(): ReelTitle[] {
  return Object.values(MOCK_JELLYFIN_ITEMS).map(mockToReel)
}

const REEL_FIELDS =
  'ProductionYear,Genres,Overview,CommunityRating,CriticRating,OfficialRating,DateCreated,MediaSources,ChildCount,RecursiveItemCount'

async function fetchReel(kind: 'movies' | 'tv', limit = 600): Promise<ReelTitle[]> {
  const { userId } = await getSession()
  const data = await jfGet<{ Items: RawItem[] }>('/Items', {
    userId,
    IncludeItemTypes: kind === 'tv' ? 'Series' : 'Movie',
    Recursive: true,
    SortBy: 'SortName',
    SortOrder: 'Ascending',
    Fields: REEL_FIELDS,
    ImageTypeLimit: 2,
    EnableImageTypes: 'Primary,Backdrop',
    Limit: limit,
  })
  return data.Items.map(it => toReelTitle(it, kind))
}

/** The whole library as ReelTitles — drives Home, Library, Picker, Search, Stats. */
export async function getCatalog(): Promise<ReelTitle[]> {
  if (!isJellyfinConfigured()) return mockCatalog()
  try {
    const [movies, series] = await Promise.all([fetchReel('movies'), fetchReel('tv')])
    return [...movies, ...series]
  } catch {
    return []
  }
}

/** The hero title: prefer a backdrop-having, well-rated movie; fall back to anything. */
export async function getFeatured(catalog?: ReelTitle[]): Promise<ReelTitle | null> {
  const all = catalog ?? (await getCatalog())
  if (all.length === 0) return null
  const withBackdrop = all.filter(t => t.backdropUrl)
  const pool = withBackdrop.length ? withBackdrop : all
  return [...pool].sort((a, b) => (b.imdb ?? 0) - (a.imdb ?? 0))[0]
}

/** Continue-watching entries with progress + a contextual sub-label. */
export async function getReelResume(): Promise<ContinueItem[]> {
  if (!isJellyfinConfigured()) {
    return mockCatalog().slice(0, 4).map((t, i) => ({
      id: t.id,
      href: `/media/${t.type === 'tv' ? 'tv' : 'movies'}/${t.id}`,
      title: t.title,
      sub: t.type === 'tv' ? `S1 · ${15 + i * 20}% left` : `${28 + i * 18}m left`,
      progress: 0.2 + i * 0.18,
      hue: t.hue,
      backdropColor: t.backdropColor,
    }))
  }
  try {
    const { userId } = await getSession()
    const data = await jfGet<{ Items: RawItem[] }>(`/Users/${userId}/Items/Resume`, {
      Limit: 12,
      MediaTypes: 'Video',
      Fields: 'ProductionYear,SeriesName,RunTimeTicks',
      ImageTypeLimit: 1,
      EnableImageTypes: 'Primary,Backdrop',
    })
    return data.Items.map(it => {
      const isEpisode = it.Type === 'Episode'
      const seriesId = it.SeriesId
      const hue = hueFromId(seriesId ?? it.Id)
      const remainingTicks = (it.RunTimeTicks ?? 0) - (it.UserData?.PlaybackPositionTicks ?? 0)
      const minsLeft = remainingTicks > 0 ? Math.round(remainingTicks / 600_000_000) : 0
      const epLabel =
        it.ParentIndexNumber != null && it.IndexNumber != null
          ? `S${it.ParentIndexNumber} · E${it.IndexNumber}`
          : undefined
      return {
        id: it.Id,
        href: isEpisode && seriesId ? `/media/tv/${seriesId}` : `/media/movies/${it.Id}`,
        title: isEpisode ? it.SeriesName ?? it.Name : it.Name,
        subtitle: isEpisode ? [epLabel, it.Name].filter(Boolean).join(' · ') : undefined,
        sub: minsLeft ? `${minsLeft}m left` : undefined,
        progress: progressOf(it),
        hue,
        backdropUrl: it.BackdropImageTags?.[0]
          ? imageUrl(it.Id, 'Backdrop', { tag: it.BackdropImageTags[0], maxWidth: 720, quality: 80 })
          : it.ImageTags?.Primary
            ? imageUrl(it.Id, 'Primary', { tag: it.ImageTags.Primary, maxWidth: 720 })
            : undefined,
        backdropColor: backdropArt(hue),
      } satisfies ContinueItem
    })
  } catch {
    return []
  }
}

function fmtBytes(n?: number): string | undefined {
  if (!n) return undefined
  const gb = n / 1_073_741_824
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${Math.round(n / 1_048_576)} MB`
}

/** Technical file details for the detail page (resolution, codecs, size, path). */
export async function getFileInfo(id: string): Promise<FileInfo | null> {
  if (!isJellyfinConfigured()) {
    return { resolution: '4K HDR · 3840×2160', videoCodec: 'HEVC 10-bit', audio: 'TrueHD Atmos 7.1', container: 'MKV', size: '48.2 GB', path: `/media/${id}` }
  }
  try {
    const { userId } = await getSession()
    // PlaybackInfo reliably returns MediaSources with full MediaStreams (the GET
    // item endpoint often omits them) — same source getPlayback uses.
    const res = await jfPost(`/Items/${id}/PlaybackInfo`, { UserId: userId }, { userId })
    if (!res.ok) return null
    const info = (await res.json()) as { MediaSources?: RawMediaSource[] }
    const ms = info.MediaSources?.[0]
    if (!ms) return null
    const streams = ms.MediaStreams ?? []
    const v = streams.find(s => s.Type === 'Video')
    const a = streams.find(s => s.Type === 'Audio' && s.IsDefault) ?? streams.find(s => s.Type === 'Audio')
    const resolution = v?.Width && v?.Height ? `${v.Width}×${v.Height}` : undefined
    return {
      resolution,
      videoCodec: v?.Codec ? v.Codec.toUpperCase() : undefined,
      audio: a?.DisplayTitle ?? (a?.Codec ? a.Codec.toUpperCase() : undefined),
      container: ms.Container?.toUpperCase(),
      size: fmtBytes(ms.Size),
      path: ms.Path,
    }
  } catch {
    return null
  }
}

/** Franchise collections from Jellyfin BoxSets (with their member title ids). */
export async function getBoxSets(): Promise<CollectionSummary[]> {
  if (!isJellyfinConfigured()) return mockCollections()
  try {
    const { userId } = await getSession()
    const data = await jfGet<{ Items: RawItem[] }>('/Items', {
      userId,
      IncludeItemTypes: 'BoxSet',
      Recursive: true,
      SortBy: 'SortName',
      Fields: 'Overview',
    })
    return Promise.all(
      data.Items.map(async bs => {
        const members = await jfGet<{ Items: RawItem[] }>('/Items', {
          userId,
          ParentId: bs.Id,
          SortBy: 'PremiereDate,ProductionYear',
          Fields: 'ProductionYear',
        }).catch(() => ({ Items: [] as RawItem[] }))
        return {
          id: bs.Id,
          name: bs.Name,
          hue: hueFromId(bs.Id),
          tagline: bs.Overview,
          itemIds: members.Items.map(m => m.Id),
        } satisfies CollectionSummary
      }),
    )
  } catch {
    return []
  }
}

/** Dev/no-server fallback: a couple of grouped mock collections by shared genre. */
function mockCollections(): CollectionSummary[] {
  const cat = mockCatalog()
  const byGenre = (g: string) => cat.filter(t => t.genres.includes(g)).map(t => t.id)
  return [
    { id: 'mock-scifi', name: 'Science Fiction', hue: 210, tagline: 'Worlds beyond ours.', itemIds: byGenre('Science Fiction') },
    { id: 'mock-drama', name: 'Drama', hue: 30, tagline: 'Stories that linger.', itemIds: byGenre('Drama') },
  ].filter(c => c.itemIds.length > 0)
}

function castFromRaw(people: RawItem['People']): ReelCastMember[] {
  // Jellyfin can list the same person more than once (multiple roles) — keep the
  // first occurrence so the UI shows each person a single time.
  const seen = new Set<string>()
  return (people ?? [])
    .filter(p => {
      if (seen.has(p.Id)) return false
      seen.add(p.Id)
      return true
    })
    .slice(0, 20)
    .map(p => ({
      id: p.Id,
      name: p.Name,
      role: p.Role,
      isDirector: p.Type === 'Director',
      hue: hueFromId(p.Id),
      imageUrl: p.PrimaryImageTag ? imageUrl(p.Id, 'Primary', { tag: p.PrimaryImageTag, maxWidth: 200 }) : undefined,
    }))
}

function mockDetail(item: JellyfinItem): ReelDetail {
  const base = mockToReel(item)
  const seasonList = item.Seasons?.map(s => ({
    id: s.Id,
    name: s.Name,
    index: s.IndexNumber,
    episodeCount: s.EpisodeCount,
    year: s.ProductionYear,
    hue: hueFromId(s.Id),
    posterUrl: s.posterUrl,
    episodes: (s.Episodes ?? []).map(e => ({
      id: e.Id, name: e.Name, index: e.IndexNumber, overview: e.Overview,
      runtime: e.RunTimeTicks ? Math.round(e.RunTimeTicks / 600_000_000) : undefined,
      hue: hueFromId(e.Id), imageUrl: e.imageUrl,
    })),
  }))
  const director = item.People.find(p => p.Type === 'Director')
  return {
    ...base,
    studios: (item.Studios ?? []).map(s => s.Name),
    cast: item.People.slice(0, 20).map(p => ({
      id: p.Id, name: p.Name, role: p.Role, isDirector: p.Type === 'Director', hue: hueFromId(p.Id),
    })),
    createdBy: director?.Name,
    seasonList,
  }
}

/** Full detail view model for the redesigned detail page. */
export async function getReelDetail(id: string): Promise<ReelDetail | null> {
  if (!isJellyfinConfigured()) {
    const mock = MOCK_JELLYFIN_ITEMS[id]
    return mock ? mockDetail(mock) : null
  }
  const { userId } = await getSession()
  let raw: RawItem
  try {
    raw = await jfGet<RawItem>(`/Items/${id}`, {
      userId,
      Fields: 'Overview,Genres,People,Studios,Taglines,MediaSources,ProductionYear,CriticRating,DateCreated',
    })
  } catch {
    return null
  }
  const kind = raw.Type === 'Series' ? 'tv' : 'movies'
  const base = toReelTitle(raw, kind)
  const director = (raw.People ?? []).find(p => p.Type === 'Director')
  const detail: ReelDetail = {
    ...base,
    backdropUrl: raw.BackdropImageTags?.[0]
      ? imageUrl(id, 'Backdrop', { tag: raw.BackdropImageTags[0], maxWidth: 1920, quality: 80 })
      : base.backdropUrl,
    studios: (raw.Studios ?? []).map(s => s.Name),
    cast: castFromRaw(raw.People),
    createdBy: director?.Name,
  }
  if (kind === 'tv') {
    try {
      const seasonList = (await getSeasons(id, userId))
        .filter(s => s.EpisodeCount > 0)
        .map(s => ({
          id: s.Id,
          name: s.Name,
          index: s.IndexNumber,
          episodeCount: s.EpisodeCount,
          year: s.ProductionYear,
          hue: hueFromId(s.Id),
          posterUrl: s.posterUrl,
          episodes: (s.Episodes ?? []).map(e => ({
            id: e.Id, name: e.Name, index: e.IndexNumber, overview: e.Overview,
            runtime: e.RunTimeTicks ? Math.round(e.RunTimeTicks / 600_000_000) : undefined,
            hue: hueFromId(e.Id), imageUrl: e.imageUrl,
          })),
        }))
      detail.seasonList = seasonList
      detail.seasons = seasonList.length
      detail.episodes = seasonList.reduce((a, s) => a + s.episodeCount, 0)
    } catch {
      /* leave seasons undefined */
    }
  }
  return detail
}

/** "More like this" as ReelTitles (similar items can be either type). */
export async function getReelSimilar(id: string): Promise<ReelTitle[]> {
  if (!isJellyfinConfigured()) return mockCatalog().filter(t => t.id !== id).slice(0, 12)
  try {
    const { userId } = await getSession()
    const data = await jfGet<{ Items: RawItem[] }>(`/Items/${id}/Similar`, {
      userId, limit: 12, Fields: REEL_FIELDS,
    })
    return data.Items.map(it => toReelTitle(it, it.Type === 'Series' ? 'tv' : 'movies'))
  } catch {
    return []
  }
}

function mockPerson(id: string): ReelPerson | null {
  let name = ''
  const filmography: ReelTitle[] = []
  for (const item of Object.values(MOCK_JELLYFIN_ITEMS)) {
    const p = item.People.find(pp => pp.Id === id)
    if (p) { name = p.Name; filmography.push(mockToReel(item)) }
  }
  if (!name) return null
  return { id, name, hue: hueFromId(id), filmography, episodes: [] }
}

/** A cast/crew member's detail + the library titles & episodes they appear in. */
export async function getPerson(id: string): Promise<ReelPerson | null> {
  if (!isJellyfinConfigured()) return mockPerson(id)
  const { userId } = await getSession()
  let raw: RawItem
  try {
    raw = await jfGet<RawItem>(`/Items/${id}`, {
      userId, Fields: 'Overview', EnableImageTypes: 'Primary', ImageTypeLimit: 1,
    })
  } catch {
    return null
  }
  // Movies, series, and individual episodes the person is credited in.
  const items = await jfGet<{ Items: RawItem[] }>('/Items', {
    userId,
    PersonIds: id,
    Recursive: true,
    IncludeItemTypes: 'Movie,Series,Episode',
    Fields: `${REEL_FIELDS},SeriesName`,
    SortBy: 'PremiereDate,ProductionYear',
    SortOrder: 'Descending',
    EnableImageTypes: 'Primary,Backdrop',
    ImageTypeLimit: 2,
    Limit: 200,
  }).catch(() => ({ Items: [] as RawItem[] }))

  const filmography: ReelTitle[] = []
  const episodes: ReelPersonEpisode[] = []
  for (const it of items.Items) {
    if (it.Type === 'Episode') {
      if (!it.SeriesId || !it.SeasonId) continue
      episodes.push({
        id: it.Id,
        name: it.Name,
        seriesId: it.SeriesId,
        seriesName: it.SeriesName ?? '',
        seasonId: it.SeasonId,
        seasonIndex: it.ParentIndexNumber ?? 0,
        episodeIndex: it.IndexNumber ?? 0,
        year: it.ProductionYear,
        hue: hueFromId(it.Id),
        imageUrl: it.ImageTags?.Primary ? imageUrl(it.Id, 'Primary', { tag: it.ImageTags.Primary, maxWidth: 480 }) : undefined,
      })
    } else {
      filmography.push(toReelTitle(it, it.Type === 'Series' ? 'tv' : 'movies'))
    }
  }

  const hue = hueFromId(id)
  return {
    id,
    name: raw.Name,
    overview: raw.Overview,
    hue,
    imageUrl: raw.ImageTags?.Primary ? imageUrl(id, 'Primary', { tag: raw.ImageTags.Primary, maxWidth: 400 }) : undefined,
    filmography,
    episodes,
  }
}

// ---------------------------------------------------------------------------
// Public list/detail API
// ---------------------------------------------------------------------------

const LIST_FIELDS = 'ProductionYear,MediaSources'

export async function getMovies(opts: { limit?: number; startIndex?: number } = {}): Promise<MediaItem[]> {
  if (!isJellyfinConfigured()) return MOCK_MOVIES
  try {
    const { userId } = await getSession()
    const data = await jfGet<{ Items: RawItem[] }>('/Items', {
      userId,
      IncludeItemTypes: 'Movie',
      Recursive: true,
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      Fields: LIST_FIELDS,
      ImageTypeLimit: 1,
      EnableImageTypes: 'Primary',
      StartIndex: opts.startIndex ?? 0,
      Limit: opts.limit ?? 400,
    })
    return data.Items.map(it => toMediaItem(it, 'movies'))
  } catch {
    // Jellyfin unreachable: degrade to an empty shelf rather than crashing the page/build.
    return []
  }
}

export async function getSeries(opts: { limit?: number; startIndex?: number } = {}): Promise<MediaItem[]> {
  if (!isJellyfinConfigured()) return MOCK_TV
  try {
    const { userId } = await getSession()
    const data = await jfGet<{ Items: RawItem[] }>('/Items', {
      userId,
      IncludeItemTypes: 'Series',
      Recursive: true,
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      Fields: LIST_FIELDS,
      ImageTypeLimit: 1,
      EnableImageTypes: 'Primary',
      StartIndex: opts.startIndex ?? 0,
      Limit: opts.limit ?? 400,
    })
    return data.Items.map(it => toMediaItem(it, 'tv'))
  } catch {
    return []
  }
}

export async function getResume(): Promise<MediaItem[]> {
  if (!isJellyfinConfigured()) return MOCK_CONTINUE_WATCHING
  try {
    const { userId } = await getSession()
    const data = await jfGet<{ Items: RawItem[] }>(`/Users/${userId}/Items/Resume`, {
      Limit: 12,
      MediaTypes: 'Video',
      Fields: 'ProductionYear,SeriesName',
      ImageTypeLimit: 1,
      EnableImageTypes: 'Primary',
    })
    return data.Items.map(resumeToMediaItem)
  } catch {
    return []
  }
}

export async function getSimilar(id: string, kind: 'movies' | 'tv'): Promise<MediaItem[]> {
  if (!isJellyfinConfigured()) {
    return (kind === 'movies' ? MOCK_MOVIES : MOCK_TV).filter(m => m.id !== id).slice(0, 8)
  }
  const { userId } = await getSession()
  try {
    const data = await jfGet<{ Items: RawItem[] }>(`/Items/${id}/Similar`, {
      userId,
      limit: 12,
      Fields: LIST_FIELDS,
    })
    return data.Items.map(it => toMediaItem(it, kind))
  } catch {
    return []
  }
}

function buildDetail(raw: RawItem): JellyfinItem {
  const people: JellyfinPerson[] = (raw.People ?? []).map(p => ({
    Id: p.Id,
    Name: p.Name,
    Role: p.Role,
    Type: (p.Type as JellyfinPerson['Type']) ?? 'Actor',
    PrimaryImageTag: p.PrimaryImageTag,
    imageUrl: p.PrimaryImageTag
      ? imageUrl(p.Id, 'Primary', { tag: p.PrimaryImageTag, maxWidth: 160 })
      : undefined,
  }))
  return {
    Id: raw.Id,
    Name: raw.Name,
    OriginalTitle: raw.OriginalTitle,
    Overview: raw.Overview,
    Taglines: raw.Taglines,
    Genres: raw.Genres ?? [],
    People: people,
    RunTimeTicks: raw.RunTimeTicks,
    ProductionYear: raw.ProductionYear,
    OfficialRating: raw.OfficialRating,
    CommunityRating: raw.CommunityRating,
    Studios: raw.Studios,
    BackdropImageTags: raw.BackdropImageTags,
    ImageTags: raw.ImageTags,
    Type: raw.Type === 'Series' ? 'Series' : 'Movie',
    Status: raw.Status,
    posterColor: fallbackGradient(raw.Id),
    backdropColor: backdropGradient(raw.Id),
    posterUrl: raw.ImageTags?.Primary
      ? imageUrl(raw.Id, 'Primary', { tag: raw.ImageTags.Primary, maxWidth: 600 })
      : undefined,
    backdropUrl: raw.BackdropImageTags?.[0]
      ? imageUrl(raw.Id, 'Backdrop', { tag: raw.BackdropImageTags[0], maxWidth: 1920, quality: 80 })
      : undefined,
    logoUrl: raw.ImageTags?.Logo
      ? imageUrl(raw.Id, 'Logo', { tag: raw.ImageTags.Logo, maxWidth: 480 })
      : undefined,
  }
}

async function getSeasons(seriesId: string, userId: string): Promise<JellyfinSeason[]> {
  const seasonsData = await jfGet<{ Items: RawItem[] }>(`/Shows/${seriesId}/Seasons`, {
    userId,
    Fields: 'ProductionYear',
    EnableImageTypes: 'Primary',
    ImageTypeLimit: 1,
  })
  return Promise.all(
    seasonsData.Items.map(async s => {
      const eps = await jfGet<{ Items: RawItem[] }>(`/Shows/${seriesId}/Episodes`, {
        userId,
        seasonId: s.Id,
        Fields: 'Overview',
        EnableImageTypes: 'Primary',
        ImageTypeLimit: 1,
      })
      return {
        Id: s.Id,
        Name: s.Name,
        IndexNumber: s.IndexNumber ?? 0,
        EpisodeCount: eps.Items.length,
        ProductionYear: s.ProductionYear,
        posterUrl: s.ImageTags?.Primary
          ? imageUrl(s.Id, 'Primary', { tag: s.ImageTags.Primary, maxWidth: 360 })
          : undefined,
        Episodes: eps.Items.map(e => ({
          Id: e.Id,
          Name: e.Name,
          IndexNumber: e.IndexNumber ?? 0,
          Overview: e.Overview,
          RunTimeTicks: e.RunTimeTicks,
          imageUrl: e.ImageTags?.Primary
            ? imageUrl(e.Id, 'Primary', { tag: e.ImageTags.Primary, maxWidth: 480 })
            : undefined,
        })),
      } satisfies JellyfinSeason
    }),
  )
}

export async function getJellyfinItem(id: string): Promise<JellyfinItem | null> {
  if (!isJellyfinConfigured()) return MOCK_JELLYFIN_ITEMS[id] ?? null
  const { userId } = await getSession()
  let raw: RawItem
  try {
    raw = await jfGet<RawItem>(`/Items/${id}`, {
      userId,
      Fields: 'Overview,Genres,People,Studios,Taglines,MediaSources,ProductionYear',
    })
  } catch {
    return null
  }
  const item = buildDetail(raw)
  if (item.Type === 'Series') {
    try {
      const seasons = await getSeasons(id, userId)
      item.Seasons = seasons
      item.SeasonCount = seasons.length
      item.EpisodeCount = seasons.reduce((a, s) => a + s.EpisodeCount, 0)
    } catch {
      // Leave Seasons undefined — the detail page still renders without the episode list.
    }
  }
  return item
}

// ---------------------------------------------------------------------------
// Playback resolution + reporting
// ---------------------------------------------------------------------------

export interface PlaybackSource {
  itemId: string
  method: 'direct' | 'hls'
  url: string
  mediaSourceId: string
  playSessionId: string
  positionTicks: number
  runtimeTicks: number
  /** Whether the server is doing work (transcode/remux) vs streaming original bytes. */
  transcoding: boolean
  /** Human label for the UI, e.g. "Direct Play", "Transcoding (audio)", "Remuxing". */
  playMethodLabel: string
}

// Codecs the browser profile (BROWSER_PROFILE) lets Direct Play. Used to describe
// *what* is being transcoded when Jellyfin won't Direct Play (it doesn't return
// TranscodeReasons on 10.11), by comparing against the source's actual streams.
const VIDEO_OK = new Set(['h264', 'vp8', 'vp9', 'av1'])
const AUDIO_OK = new Set(['aac', 'mp3', 'opus', 'flac', 'vorbis'])

function transcodeDetail(ms: RawMediaSource): string {
  const streams = ms.MediaStreams ?? []
  if (streams.length === 0) return 'Transcoding'
  const v = streams.find(s => s.Type === 'Video')
  const a = streams.find(s => s.Type === 'Audio' && s.IsDefault) ?? streams.find(s => s.Type === 'Audio')
  const parts: string[] = []
  if (v && !VIDEO_OK.has((v.Codec ?? '').toLowerCase())) parts.push('video')
  if (a && !AUDIO_OK.has((a.Codec ?? '').toLowerCase())) parts.push('audio')
  if (parts.length === 0) return 'Remuxing'
  return `Transcoding (${parts.join(' + ')})`
}

// A browser-shaped device profile. The key effect: only mp4/webm with browser-decodable
// audio (aac/mp3/opus/flac/vorbis) is allowed to Direct Play — so DTS/AC3 audio and MKV
// are routed to an HLS transcode that copies H.264 video and converts audio to AAC.
const BROWSER_PROFILE = {
  MaxStreamingBitrate: 120_000_000,
  MaxStaticBitrate: 100_000_000,
  MusicStreamingTranscodingBitrate: 384_000,
  DirectPlayProfiles: [
    { Container: 'mp4,m4v', Type: 'Video', VideoCodec: 'h264,vp9,av1', AudioCodec: 'aac,mp3,opus,flac,vorbis' },
    { Container: 'webm', Type: 'Video', VideoCodec: 'vp8,vp9,av1', AudioCodec: 'vorbis,opus' },
    { Container: 'mp3', Type: 'Audio' },
    { Container: 'aac', Type: 'Audio' },
    { Container: 'm4a,m4b', AudioCodec: 'aac', Type: 'Audio' },
    { Container: 'flac', Type: 'Audio' },
    { Container: 'webma,webm', AudioCodec: 'opus,vorbis', Type: 'Audio' },
    { Container: 'ogg', Type: 'Audio' },
  ],
  TranscodingProfiles: [
    {
      Container: 'ts',
      Type: 'Video',
      Protocol: 'hls',
      Context: 'Streaming',
      VideoCodec: 'h264',
      AudioCodec: 'aac,mp3',
      MaxAudioChannels: '2',
      MinSegments: 1,
      BreakOnNonKeyFrames: true,
    },
    {
      Container: 'aac',
      Type: 'Audio',
      Protocol: 'http',
      Context: 'Streaming',
      AudioCodec: 'aac',
      MaxAudioChannels: '2',
    },
  ],
  CodecProfiles: [],
  SubtitleProfiles: [{ Format: 'vtt', Method: 'External' }],
}

function withApiKey(rawUrl: string, token: string): string {
  const full = rawUrl.startsWith('http') ? rawUrl : `${baseUrl()}${rawUrl}`
  if (/[?&]api_key=/.test(full)) return full
  return `${full}${full.includes('?') ? '&' : '?'}api_key=${token}`
}

export async function getPlayback(
  itemId: string,
  opts: { forceHls?: boolean } = {},
): Promise<PlaybackSource | null> {
  if (!isJellyfinConfigured()) return null
  const url = baseUrl()!
  const { userId, accessToken } = await getSession()

  // Send a real browser device profile so Jellyfin only reports DirectPlay when the
  // browser can actually decode the file. For DTS/AC3 audio or MKV it instead returns a
  // TranscodingUrl that copies the H.264 video and transcodes the audio to AAC.
  const res = await jfPost(
    `/Items/${itemId}/PlaybackInfo`,
    { UserId: userId, DeviceProfile: BROWSER_PROFILE, MaxStreamingBitrate: 120_000_000 },
    { userId },
  )
  if (!res.ok) return null
  const info = (await res.json()) as { PlaySessionId: string; MediaSources?: RawMediaSource[] }
  const ms = info.MediaSources?.[0]
  if (!ms) return null

  const positionTicks = await jfGet<RawItem>(`/Items/${itemId}`, { userId })
    .then(d => d.UserData?.PlaybackPositionTicks ?? 0)
    .catch(() => 0)

  const common = {
    itemId,
    mediaSourceId: ms.Id,
    playSessionId: info.PlaySessionId,
    positionTicks,
    runtimeTicks: ms.RunTimeTicks ?? 0,
  }

  // Truly browser-compatible → stream the original bytes (≈0 server CPU).
  if (!opts.forceHls && ms.SupportsDirectPlay) {
    const container = ms.Container || 'mp4'
    return {
      ...common,
      method: 'direct',
      transcoding: false,
      playMethodLabel: 'Direct Play',
      url: `${url}/Videos/${itemId}/stream.${container}${qs({
        static: true,
        mediaSourceId: ms.Id,
        api_key: accessToken,
        PlaySessionId: info.PlaySessionId,
      })}`,
    }
  }

  // Otherwise transcode/remux over HLS. Prefer Jellyfin's computed URL (it selects the
  // right audio stream + bitrate); fall back to a hand-built master playlist.
  const transcoding = { transcoding: true, playMethodLabel: transcodeDetail(ms) } as const
  if (ms.TranscodingUrl) {
    return { ...common, ...transcoding, method: 'hls', url: withApiKey(ms.TranscodingUrl, accessToken) }
  }
  return {
    ...common,
    ...transcoding,
    method: 'hls',
    url: `${url}/Videos/${itemId}/master.m3u8${qs({
      mediaSourceId: ms.Id,
      api_key: accessToken,
      PlaySessionId: info.PlaySessionId,
      VideoCodec: 'h264',
      AudioCodec: 'aac',
    })}`,
  }
}

export interface PlaybackReport {
  ItemId: string
  PlaySessionId?: string
  MediaSourceId?: string
  PositionTicks?: number
  IsPaused?: boolean
}

export async function reportPlayback(
  kind: 'start' | 'progress' | 'stopped',
  body: PlaybackReport,
): Promise<void> {
  if (!isJellyfinConfigured()) return
  const path =
    kind === 'start'
      ? '/Sessions/Playing'
      : kind === 'progress'
        ? '/Sessions/Playing/Progress'
        : '/Sessions/Playing/Stopped'
  await jfPost(path, body).catch(() => { })
}
