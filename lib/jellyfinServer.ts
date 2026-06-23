import 'server-only'
import type { MediaItem } from '@/app/_components/media/MediaCard'
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
  Height?: number
  Width?: number
}
interface RawMediaSource {
  Id: string
  Container?: string
  SupportsDirectPlay?: boolean
  SupportsDirectStream?: boolean
  RunTimeTicks?: number
  MediaStreams?: RawStream[]
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
  Status?: 'Ended' | 'Continuing'
  Height?: number
  SeriesName?: string
  SeriesId?: string
  IndexNumber?: number
  ParentIndexNumber?: number
  ImageTags?: { Primary?: string; Logo?: string }
  BackdropImageTags?: string[]
  Studios?: { Name: string; Id: string }[]
  People?: { Id: string; Name: string; Role?: string; Type?: string; PrimaryImageTag?: string }[]
  MediaSources?: RawMediaSource[]
  UserData?: { PlaybackPositionTicks?: number; PlayedPercentage?: number }
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
  })
  return Promise.all(
    seasonsData.Items.map(async s => {
      const eps = await jfGet<{ Items: RawItem[] }>(`/Shows/${seriesId}/Episodes`, {
        userId,
        seasonId: s.Id,
        Fields: 'Overview',
      })
      return {
        Id: s.Id,
        Name: s.Name,
        IndexNumber: s.IndexNumber ?? 0,
        EpisodeCount: eps.Items.length,
        ProductionYear: s.ProductionYear,
        Episodes: eps.Items.map(e => ({
          Id: e.Id,
          Name: e.Name,
          IndexNumber: e.IndexNumber ?? 0,
          Overview: e.Overview,
          RunTimeTicks: e.RunTimeTicks,
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
}

export async function getPlayback(
  itemId: string,
  opts: { forceHls?: boolean } = {},
): Promise<PlaybackSource | null> {
  if (!isJellyfinConfigured()) return null
  const url = baseUrl()!
  const { userId, accessToken } = await getSession()

  const res = await jfPost(`/Items/${itemId}/PlaybackInfo`, {}, { userId })
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

  if (!opts.forceHls && (ms.SupportsDirectPlay || ms.SupportsDirectStream)) {
    const container = ms.Container || 'mp4'
    return {
      ...common,
      method: 'direct',
      url: `${url}/Videos/${itemId}/stream.${container}${qs({
        static: true,
        mediaSourceId: ms.Id,
        api_key: accessToken,
        PlaySessionId: info.PlaySessionId,
      })}`,
    }
  }

  // Fall back to server-side transcode over HLS (played via hls.js / native HLS).
  return {
    ...common,
    method: 'hls',
    url: `${url}/Videos/${itemId}/master.m3u8${qs({
      mediaSourceId: ms.Id,
      api_key: accessToken,
      PlaySessionId: info.PlaySessionId,
      VideoCodec: 'h264',
      AudioCodec: 'aac,mp3',
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
