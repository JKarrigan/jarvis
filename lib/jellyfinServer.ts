import 'server-only'
import { cache } from 'react'
import { revalidateTag, unstable_cache } from 'next/cache'
import type {
  ReelTitle, ReelCredit, ContinueItem, ReelDetail, ReelEpisodeDetail, ReelCastMember, CollectionSummary, ReelPerson,
  ReelPersonEpisode, ReelSeasonInfo, MediaInfo, MediaVersion, TrailerInfo, PlaybackSource,
} from '@/app/_components/media/types'
import { hueFromId, poster as posterArt, backdrop as backdropArt } from '@/app/_components/media/artwork'
import { ticksToMinutes, type PlaybackReport, type ReportKind } from '@/app/_components/media/playback'
import { MOCK_JELLYFIN_ITEMS, type JellyfinItem } from './jellyfin'
import { getSetting, setSetting } from './db'

// ---------------------------------------------------------------------------
// Config + auth. The Jellyfin server runs on the Synology; this Next.js app (on
// the Pi) authenticates once as a single dashboard user. The token is cached on
// `globalThis` and persisted in the SQLite settings table so a restart doesn't
// log in again. It never leaves the server: every image and media stream the
// browser loads goes through /api/jellyfin/stream/…, which adds the token
// upstream (see app/api/jellyfin/stream/[...path]/route.ts).
// ---------------------------------------------------------------------------

const CLIENT = 'Jarvis'
const DEVICE = 'Raspberry Pi'
const DEVICE_ID = 'jarvis-dashboard'
const VERSION = '1.0.0'

export function baseUrl(): string | undefined {
  return process.env.JELLYFIN_URL?.replace(/\/+$/, '') || undefined
}

/**
 * Mock data (a small fake library) only when explicitly asked for with MEDIA_MOCK=1,
 * or in development when no JELLYFIN_URL is set at all. A half-configured server
 * (typo, missing password) is an error, never a silently fake library.
 */
export function isMockMode(): boolean {
  if (process.env.MEDIA_MOCK === '1') return true
  return !process.env.JELLYFIN_URL && process.env.NODE_ENV === 'development'
}

function hasCredentials(): boolean {
  return Boolean(process.env.JELLYFIN_API_KEY || (process.env.JELLYFIN_USER && process.env.JELLYFIN_PASSWORD))
}

/** A failed Jellyfin call. `status` is the upstream HTTP status, 503 when not configured,
    504 when the server could not be reached. */
export class JellyfinError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message)
    this.name = 'JellyfinError'
  }
}

/** The item doesn't exist (or the id was malformed) — a 404, not an outage. */
export function isNotFound(e: unknown): boolean {
  return e instanceof JellyfinError && (e.status === 404 || e.status === 400)
}

const JF_ID = /^[0-9a-f]{32}$/i

/** Jellyfin item ids are 32 hex chars; mock mode uses short slugs ('m1', 'tv8s4e1'). */
export function isItemId(id: unknown): id is string {
  if (typeof id !== 'string') return false
  return JF_ID.test(id) || (isMockMode() && /^[\w-]{1,80}$/.test(id))
}

const enc = encodeURIComponent

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

// Hard ceiling on any single Jellyfin request so a hung server fails fast into
// the error path instead of hanging the route (and every caller sharing a login).
const JF_TIMEOUT_MS = 10_000

// Persisted session (password mode only — an API key already lives in the env).
const SESSION_KEY = 'jellyfin.session.v1'

function sessionIdentity() {
  return { url: baseUrl() ?? '', user: process.env.JELLYFIN_USER ?? '' }
}

function loadStoredSession(): JfSession | null {
  if (process.env.JELLYFIN_API_KEY) return null
  try {
    const raw = getSetting(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as JfSession & { url?: string; user?: string }
    const id = sessionIdentity()
    if (s.url !== id.url || s.user !== id.user || !s.accessToken || !s.userId) return null
    return { accessToken: s.accessToken, userId: s.userId }
  } catch {
    return null
  }
}

function saveStoredSession(s: JfSession) {
  if (process.env.JELLYFIN_API_KEY) return
  try { setSetting(SESSION_KEY, JSON.stringify({ ...s, ...sessionIdentity() })) } catch { /* DB unavailable: memory only */ }
}

async function authenticate(): Promise<JfSession> {
  const url = baseUrl()
  if (!url) throw new JellyfinError('JELLYFIN_URL not set', 503)

  // API-key mode: the key is the token; resolve a user id for user-scoped calls.
  if (process.env.JELLYFIN_API_KEY) {
    const token = process.env.JELLYFIN_API_KEY
    let userId = process.env.JELLYFIN_USER_ID
    if (!userId) {
      const res = await fetch(`${url}/Users`, {
        headers: { Authorization: authHeader(token), Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(JF_TIMEOUT_MS),
      })
      if (!res.ok) throw new JellyfinError(`Jellyfin /Users ${res.status}`, res.status)
      const users = (await res.json()) as { Id: string }[]
      userId = users[0]?.Id
      if (!userId) throw new JellyfinError('No Jellyfin users found for API-key mode', 503)
    }
    return { accessToken: token, userId }
  }

  // Username/password mode (preferred for a LAN dashboard user).
  const res = await fetch(`${url}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader(), Accept: 'application/json' },
    body: JSON.stringify({ Username: process.env.JELLYFIN_USER, Pw: process.env.JELLYFIN_PASSWORD }),
    cache: 'no-store',
    signal: AbortSignal.timeout(JF_TIMEOUT_MS),
  })
  if (!res.ok) throw new JellyfinError(`Jellyfin AuthenticateByName ${res.status}`, res.status === 401 ? 503 : res.status)
  const data = (await res.json()) as { AccessToken: string; User: { Id: string } }
  return { accessToken: data.AccessToken, userId: data.User.Id }
}

export async function getSession(): Promise<JfSession> {
  if (!baseUrl() || !hasCredentials()) {
    throw new JellyfinError('Jellyfin is not configured (JELLYFIN_URL + JELLYFIN_USER/JELLYFIN_PASSWORD or JELLYFIN_API_KEY)', 503)
  }
  const s = store()
  if (s.session) return s.session
  const stored = loadStoredSession()
  if (stored) {
    s.session = stored
    return stored
  }
  if (!s.pending) {
    s.pending = authenticate().then(
      sess => {
        s.session = sess
        s.pending = null
        saveStoredSession(sess)
        return sess
      },
      err => {
        s.pending = null
        throw err instanceof JellyfinError ? err : new JellyfinError('Jellyfin unreachable (login)', 504)
      },
    )
  }
  return s.pending
}

/** Compare-and-clear: drop the session only if it is still the one that just failed,
    so a late 401 from an old request can't wipe a fresh login. */
function invalidateSession(token: string) {
  const s = store()
  if (s.session?.accessToken !== token) return
  s.session = null
  if (!process.env.JELLYFIN_API_KEY) {
    try { setSetting(SESSION_KEY, '') } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Fetch helpers — every upstream call goes through jfFetch (timeout + one
// re-login retry on 401).
// ---------------------------------------------------------------------------

type Params = Record<string, string | number | boolean | undefined>
export function qs(params: Params): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) usp.set(k, String(v))
  const s = usp.toString()
  return s ? `?${s}` : ''
}

export interface JfFetchOptions {
  method?: 'GET' | 'HEAD' | 'POST' | 'DELETE'
  params?: Params
  /** A raw, already-encoded query string (with or without '?'); wins over `params`. */
  search?: string
  /** JSON request body. */
  json?: unknown
  /** Raw string body (must be replayable for the 401 retry). */
  body?: string
  headers?: Record<string, string>
  /** Seconds a GET may be served from Next's data cache. Default 0 (always fresh). */
  revalidate?: number
  tags?: string[]
  /** Caller's abort signal (e.g. request.signal) — forwarded upstream. */
  signal?: AbortSignal
  /** Streaming response: the timeout covers the response headers only, not the body. */
  stream?: boolean
  timeoutMs?: number
}

export async function jfFetch(path: string, opts: JfFetchOptions = {}): Promise<Response> {
  const url = baseUrl()
  if (!url) throw new JellyfinError('JELLYFIN_URL not set', 503)
  const method = opts.method ?? 'GET'
  const query = opts.search != null
    ? (opts.search && !opts.search.startsWith('?') ? `?${opts.search}` : opts.search)
    : qs(opts.params ?? {})
  const target = `${url}${path}${query}`
  const revalidate = method === 'GET' ? opts.revalidate ?? 0 : 0
  const timeoutMs = opts.timeoutMs ?? JF_TIMEOUT_MS

  const run = async (token: string): Promise<Response> => {
    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers, Authorization: authHeader(token) }
    let body = opts.body
    if (opts.json !== undefined) {
      body = JSON.stringify(opts.json)
      headers['Content-Type'] = 'application/json'
    }
    let signal: AbortSignal
    let timer: ReturnType<typeof setTimeout> | undefined
    if (opts.stream) {
      const ac = new AbortController()
      timer = setTimeout(() => ac.abort(new DOMException('Jellyfin did not respond', 'TimeoutError')), timeoutMs)
      signal = opts.signal ? AbortSignal.any([ac.signal, opts.signal]) : ac.signal
    } else {
      const t = AbortSignal.timeout(timeoutMs)
      signal = opts.signal ? AbortSignal.any([t, opts.signal]) : t
    }
    try {
      return await fetch(target, {
        method,
        headers,
        body,
        signal,
        ...(revalidate > 0 ? { next: { revalidate, tags: opts.tags } } : { cache: 'no-store' as const }),
      })
    } catch (e) {
      if (opts.signal?.aborted) throw e
      throw new JellyfinError(`Jellyfin unreachable (${method} ${path})`, 504)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  const session = await getSession()
  const res = await run(session.accessToken)
  if (res.status !== 401) return res
  invalidateSession(session.accessToken)
  const fresh = await getSession()
  return run(fresh.accessToken)
}

/** jfFetch + status check + JSON. Throws JellyfinError (status = upstream status). */
export async function jfJson<T>(path: string, opts: JfFetchOptions = {}): Promise<T> {
  const res = await jfFetch(path, opts)
  if (!res.ok) throw new JellyfinError(`Jellyfin ${opts.method ?? 'GET'} ${path} ${res.status}`, res.status)
  return res.json() as Promise<T>
}

/** Cached GET (default 5 min in Next's data cache; pass revalidate: 0 for live data). */
export function jfGet<T>(path: string, params: Params = {}, opts: { revalidate?: number; tags?: string[] } = {}): Promise<T> {
  return jfJson<T>(path, { params, revalidate: opts.revalidate ?? 300, tags: opts.tags })
}

export function jfPost(path: string, body?: unknown, params: Params = {}): Promise<Response> {
  return jfFetch(path, { method: 'POST', json: body, params })
}

export function jfDelete(path: string, params: Params = {}): Promise<Response> {
  return jfFetch(path, { method: 'DELETE', params })
}

/** Bounded-concurrency map (keeps a burst of per-item queries from swamping the NAS). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// ---------------------------------------------------------------------------
// Same-origin proxy URLs. Everything the browser loads from Jellyfin (images,
// direct-play files, HLS playlists + segments) goes through
// /api/jellyfin/stream/<jellyfin path>, so it works over HTTPS / remotely and the
// token is added server-side. Never put an api_key in a client URL.
// ---------------------------------------------------------------------------

export const STREAM_PREFIX = '/api/jellyfin/stream'

const API_KEY_PARAM = /^(api_key|apikey)$/i

/** Remove any credential query parameter (Jellyfin accepts api_key and ApiKey). */
export function stripApiKey(search: URLSearchParams): void {
  for (const k of [...search.keys()]) if (API_KEY_PARAM.test(k)) search.delete(k)
}

/** A Jellyfin path (or an absolute Jellyfin URL) → its credential-free proxied URL. */
export function proxied(pathOrUrl: string, params: Params = {}): string {
  let p = pathOrUrl
  const base = baseUrl()
  if (base && p.toLowerCase().startsWith(base.toLowerCase())) p = p.slice(base.length)
  else if (/^https?:\/\//i.test(p)) {
    const u = new URL(p)
    p = `${u.pathname}${u.search}`
  }
  const q = p.indexOf('?')
  const pathname = q >= 0 ? p.slice(0, q) : p
  const search = new URLSearchParams(q >= 0 ? p.slice(q + 1) : '')
  stripApiKey(search)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) search.set(k, String(v))
  const s = search.toString()
  return `${STREAM_PREFIX}${pathname.startsWith('/') ? '' : '/'}${pathname}${s ? `?${s}` : ''}`
}

/** Direct-play ("static") stream of the original file, for both the browser (proxied)
    and server-side tools like ffprobe (upstream URL + Authorization header). */
export function directStream(kind: 'Videos' | 'Audio', id: string, container: string, params: Params = {}) {
  const path = `/${kind}/${enc(id)}/stream.${container}`
  const all: Params = { static: true, ...params }
  return {
    url: proxied(path, all),
    upstreamUrl: `${baseUrl() ?? ''}${path}${qs(all)}`,
  }
}

/** Header ffprobe & co. can send upstream (keeps the token out of URLs and logs). */
export async function upstreamAuthHeader(): Promise<string> {
  const { accessToken } = await getSession()
  return authHeader(accessToken)
}

export function imageUrl(
  id: string,
  type: 'Primary' | 'Backdrop' | 'Logo' = 'Primary',
  opts: { tag?: string; maxWidth?: number; quality?: number } = {},
): string | undefined {
  if (!baseUrl()) return undefined
  return proxied(`/Items/${enc(id)}/Images/${type}`, { tag: opts.tag, maxWidth: opts.maxWidth, quality: opts.quality ?? 90 })
}

// ---------------------------------------------------------------------------
// Raw Jellyfin shapes (only the fields we read)
// ---------------------------------------------------------------------------

interface RawStream {
  Type: string
  Index?: number
  Codec?: string
  Height?: number
  Width?: number
  IsDefault?: boolean
  IsForced?: boolean
  IsExternal?: boolean
  /** True for text subtitles (SRT/ASS/VTT) that can be delivered as a sidecar <track>. */
  IsTextSubtitleStream?: boolean
  Channels?: number
  ChannelLayout?: string
  Language?: string
  Title?: string
  DisplayTitle?: string
}
interface RawMediaSource {
  Id: string
  /** Version label when a title has multiple sources (e.g. "Director's Cut", "1080p"). */
  Name?: string
  Container?: string
  Path?: string
  Size?: number
  SupportsDirectPlay?: boolean
  SupportsDirectStream?: boolean
  /** Jellyfin's pre-built HLS transcode/remux URL when the source isn't browser-compatible. */
  TranscodingUrl?: string
  RunTimeTicks?: number
  DefaultAudioStreamIndex?: number
  DefaultSubtitleStreamIndex?: number
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
  ProductionYear?: number
  RunTimeTicks?: number
  Overview?: string
  Genres?: string[]
  Taglines?: string[]
  Tags?: string[]
  OfficialRating?: string
  CommunityRating?: number
  CriticRating?: number
  DateCreated?: string
  ChildCount?: number
  RecursiveItemCount?: number
  Height?: number
  SeriesName?: string
  SeriesId?: string
  SeasonId?: string
  SeasonName?: string
  PremiereDate?: string
  IndexNumber?: number
  ParentIndexNumber?: number
  ImageTags?: { Primary?: string; Logo?: string }
  BackdropImageTags?: string[]
  Studios?: { Name: string; Id: string }[]
  People?: { Id: string; Name: string; Role?: string; Type?: string; PrimaryImageTag?: string }[]
  UserData?: RawUserData
  RemoteTrailers?: { Url?: string; Name?: string }[]
}

/** Extract a YouTube video id from watch?v=, youtu.be/, shorts/, or embed/ URL forms. */
function youtubeIdFromUrl(url?: string): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (!['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return undefined
    const id = host === 'youtu.be'
      ? u.pathname.slice(1).split('/')[0]
      : u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/)?.[1]
    return id && /^[\w-]{6,20}$/.test(id) ? id : undefined
  } catch {
    return undefined
  }
}

/** Child trailer items stored alongside the movie/series. Modern path first (10.9+),
    legacy /Users path as fallback; any failure just means "no local trailer". */
async function fetchLocalTrailers(id: string, userId: string): Promise<RawItem[]> {
  try {
    return await jfGet<RawItem[]>(`/Items/${enc(id)}/LocalTrailers`, { userId })
  } catch {
    try {
      return await jfGet<RawItem[]>(`/Users/${enc(userId)}/Items/${enc(id)}/LocalTrailers`)
    } catch {
      return []
    }
  }
}

/** A local trailer wins (Direct-Play through the normal player); otherwise the first
    RemoteTrailers entry with a parseable YouTube URL. Non-YouTube URLs are skipped. */
function pickTrailer(raw: { RemoteTrailers?: { Url?: string; Name?: string }[] }, locals: RawItem[]): TrailerInfo | undefined {
  const local = locals[0]
  if (local) return { localItemId: local.Id, name: local.Name }
  for (const t of raw.RemoteTrailers ?? []) {
    const id = youtubeIdFromUrl(t.Url)
    if (id) return { youtubeId: id, remoteUrl: t.Url, name: t.Name }
  }
  return undefined
}

function badgeFor(it: RawItem): string | undefined {
  const h = it.Height
  if (!h) return undefined
  if (h >= 1400) return '4K'
  if (h >= 700) return 'HD'
  return undefined
}

// ---------------------------------------------------------------------------
// Reel mappers — the per-title model (ReelTitle) used by the media UI. Hue drives
// gradient art; watched/favorite/progress seed from Jellyfin UserData; the client
// MediaProvider overlays (and writes through) local changes.
// ---------------------------------------------------------------------------

function daysAgo(iso?: string): number | undefined {
  if (!iso) return undefined
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return undefined
  // Calendar-day difference in the server's local time, so something added late
  // yesterday reads as 1 ("Yesterday") rather than 0 just because <24h has elapsed.
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.max(0, Math.round((dayStart(new Date()) - dayStart(then)) / 86_400_000))
}

/** Precise add time (epoch ms) for exact recency ordering; `added` is the rounded day count. */
function addedAtMs(iso?: string): number | undefined {
  if (!iso) return undefined
  const t = Date.parse(iso)
  return Number.isNaN(t) ? undefined : t
}

function progressOf(it: { RunTimeTicks?: number; UserData?: RawUserData }): number {
  const ud = it.UserData
  if (ud?.PlayedPercentage != null) return Math.min(1, Math.max(0, ud.PlayedPercentage / 100))
  if (ud?.PlaybackPositionTicks && it.RunTimeTicks) return Math.min(1, ud.PlaybackPositionTicks / it.RunTimeTicks)
  return 0
}

/** ReelTitle minus the derived gradient strings (~700 chars each) — what the caches hold. */
type BareTitle = Omit<ReelTitle, 'posterColor' | 'backdropColor'>

function withArt<T extends BareTitle>(t: T): T & Pick<ReelTitle, 'posterColor' | 'backdropColor'> {
  return { ...t, posterColor: posterArt(t.hue), backdropColor: backdropArt(t.hue) }
}

/** Compact credits for a title: every director, then the top-billed cast. Someone who
    both directs and stars gets one credit of each kind. */
function creditsFromRaw(
  people: ReadonlyArray<{ Id: string; Name: string; Type?: string; PrimaryImageTag?: string }> | undefined,
  maxActors = 8,
): ReelCredit[] | undefined {
  if (!people?.length) return undefined
  const seenDirectors = new Set<string>()
  const seenActors = new Set<string>()
  const out: ReelCredit[] = []
  const credit = (p: { Id: string; Name: string; PrimaryImageTag?: string }, director?: true): ReelCredit => ({
    id: p.Id,
    name: p.Name,
    ...(director && { director }),
    // Search rows show a 36 px avatar, so a small image is plenty.
    ...(p.PrimaryImageTag && { imageUrl: imageUrl(p.Id, 'Primary', { tag: p.PrimaryImageTag, maxWidth: 96 }) }),
  })
  for (const p of people) {
    if (p.Type === 'Director' && p.Id && p.Name && !seenDirectors.has(p.Id)) {
      seenDirectors.add(p.Id)
      out.push(credit(p, true))
    }
  }
  let actors = 0
  for (const p of people) {
    if (actors >= maxActors) break
    if (p.Type === 'Actor' && p.Id && p.Name && !seenActors.has(p.Id)) {
      seenActors.add(p.Id)
      out.push(credit(p))
      actors++
    }
  }
  return out.length ? out : undefined
}

function toBareTitle(it: RawItem, kind: 'movies' | 'tv'): BareTitle {
  return {
    id: it.Id,
    title: it.Name,
    year: it.ProductionYear,
    type: kind === 'tv' ? 'tv' : 'movie',
    genres: it.Genres ?? [],
    runtime: kind === 'movies' ? ticksToMinutes(it.RunTimeTicks) : undefined,
    seasons: kind === 'tv' ? it.ChildCount : undefined,
    episodes: kind === 'tv' ? it.RecursiveItemCount : undefined,
    imdb: it.CommunityRating,
    rt: it.CriticRating,
    cert: it.OfficialRating,
    hue: hueFromId(it.Id),
    added: daysAgo(it.DateCreated),
    addedAt: addedAtMs(it.DateCreated),
    progress: progressOf(it),
    watched: Boolean(it.UserData?.Played),
    favorite: Boolean(it.UserData?.IsFavorite),
    badge: badgeFor(it),
    posterUrl: it.ImageTags?.Primary
      ? imageUrl(it.Id, 'Primary', { tag: it.ImageTags.Primary, maxWidth: 360 })
      : undefined,
    backdropUrl: it.BackdropImageTags?.[0]
      // Hero-scale by default (Jellyfin serves the original if smaller); renders
      // pick a smaller size per viewport via imageSrcSet().
      ? imageUrl(it.Id, 'Backdrop', { tag: it.BackdropImageTags[0], maxWidth: 3840, quality: 90 })
      : undefined,
    synopsis: it.Overview,
    tagline: it.Taglines?.[0],
    tags: it.Tags ?? [],
  }
}

function toReelTitle(it: RawItem, kind: 'movies' | 'tv'): ReelTitle {
  return withArt(toBareTitle(it, kind))
}

/** Map a rich mock JellyfinItem (dev / no-server mode) into a ReelTitle. */
function mockToReel(item: JellyfinItem): ReelTitle {
  const hue = hueFromId(item.Id)
  const kind = item.Type === 'Series' ? 'tv' : 'movie'
  return withArt({
    id: item.Id,
    title: item.Name,
    year: item.ProductionYear,
    type: kind,
    genres: item.Genres ?? [],
    runtime: kind === 'movie' ? ticksToMinutes(item.RunTimeTicks) : undefined,
    seasons: item.SeasonCount,
    episodes: item.EpisodeCount,
    imdb: item.CommunityRating,
    rt: undefined,
    cert: item.OfficialRating,
    hue,
    added: ((hue % 30) + 1),
    addedAt: Date.now() - ((hue % 30) + 1) * 86_400_000,
    progress: 0,
    watched: false,
    favorite: false,
    synopsis: item.Overview,
    people: slimCredits(creditsFromRaw(item.People)),
  })
}

function mockCatalog(): ReelTitle[] {
  return Object.values(MOCK_JELLYFIN_ITEMS).map(mockToReel)
}

// MediaSources is deliberately NOT requested: it multiplies the response size (every
// stream of every file) for nothing the lists show, and pushed it past Next's 2 MB
// cache limit so the whole library was refetched on every request.
const REEL_FIELDS =
  'ProductionYear,Genres,Tags,Overview,CommunityRating,CriticRating,OfficialRating,DateCreated,ChildCount,RecursiveItemCount'

/** Cache tags; busted by writes (collections), playback stops (resume/progress) and
    favorite/played toggles. */
const CATALOG_TAG = 'jf-catalog'
const RESUME_TAG = 'jf-resume'
const COLLECTIONS_TAG = 'jf-collections'

const PAGE_SIZE = 500
const MAX_TITLES = 10_000

/** One library type, paged (no silent truncation). */
async function fetchReel(kind: 'movies' | 'tv'): Promise<BareTitle[]> {
  const { userId } = await getSession()
  const out: BareTitle[] = []
  for (let start = 0; start < MAX_TITLES; start += PAGE_SIZE) {
    const data = await jfJson<{ Items: RawItem[]; TotalRecordCount?: number }>('/Items', {
      params: {
        userId,
        IncludeItemTypes: kind === 'tv' ? 'Series' : 'Movie',
        Recursive: true,
        SortBy: 'SortName',
        SortOrder: 'Ascending',
        Fields: REEL_FIELDS,
        ImageTypeLimit: 1,
        EnableImageTypes: 'Primary,Backdrop',
        StartIndex: start,
        Limit: PAGE_SIZE,
        EnableTotalRecordCount: true,
      },
    })
    out.push(...data.Items.map(it => toBareTitle(it, kind)))
    if (data.Items.length < PAGE_SIZE || out.length >= (data.TotalRecordCount ?? 0)) break
  }
  return out
}

// unstable_cache entries share the fetch cache's 2 MB per-entry ceiling; a library big
// enough to exceed it is fetched uncached (still deduped per render by cache()).
const MAX_CACHE_BYTES = 1_800_000
class TooBigToCache extends Error {
  constructor(readonly value: BareTitle[]) { super('too big to cache') }
}

const CACHE_KEY = [process.env.JELLYFIN_URL ?? '', process.env.JELLYFIN_USER ?? '']

const cachedReel = unstable_cache(
  async (kind: 'movies' | 'tv') => {
    const list = await fetchReel(kind)
    if (JSON.stringify(list).length > MAX_CACHE_BYTES) throw new TooBigToCache(list)
    return list
  },
  ['jf-reel-v2', ...CACHE_KEY],
  { tags: [CATALOG_TAG], revalidate: 300 },
)

async function reelList(kind: 'movies' | 'tv'): Promise<BareTitle[]> {
  try {
    return await cachedReel(kind)
  } catch (e) {
    if (e instanceof TooBigToCache) return e.value
    throw e
  }
}

// ---------------------------------------------------------------------------
// Credits index — directors + top-billed cast per title, for search by person and
// the library's Director / Actor filters.
// ---------------------------------------------------------------------------

type CreditsIndex = Map<string, ReelCredit[]>

/** Jellyfin takes several seconds to attach People to the whole library, and adding
    them to the catalog query pushes it past Next's 2 MB cache limit (so nothing would
    be cached). The compact index is fetched on its own and memoized in-process
    instead: a stale copy is served while a refresh runs in the background, so only the
    first request after a server start waits for Jellyfin. */
const CREDITS_TTL_MS = 5 * 60_000
const creditsG = globalThis as unknown as {
  __reelCredits?: { at: number; index: CreditsIndex }
  __reelCreditsLoad?: Promise<CreditsIndex>
}

async function fetchCreditsIndex(): Promise<CreditsIndex> {
  const { userId } = await getSession()
  const index: CreditsIndex = new Map()
  for (let start = 0, seen = 0; start < MAX_TITLES; start += PAGE_SIZE) {
    const data = await jfJson<{ Items: RawItem[]; TotalRecordCount?: number }>('/Items', {
      params: {
        userId,
        IncludeItemTypes: 'Movie,Series',
        Recursive: true,
        SortBy: 'SortName',
        SortOrder: 'Ascending',
        Fields: 'People',
        EnableImages: false,
        EnableUserData: false,
        StartIndex: start,
        Limit: PAGE_SIZE,
        EnableTotalRecordCount: true,
      },
      // ~6 s for 200 movies; the default timeout is too tight as the library grows.
      timeoutMs: 30_000,
    })
    for (const it of data.Items) {
      const credits = creditsFromRaw(it.People)
      if (credits) index.set(it.Id, credits)
    }
    seen += data.Items.length
    if (data.Items.length < PAGE_SIZE || seen >= (data.TotalRecordCount ?? 0)) break
  }
  return index
}

/** One refresh in flight at a time; on failure a stale copy keeps being served and the
    next request after another TTL tries again. */
function loadCreditsIndex(): Promise<CreditsIndex> {
  creditsG.__reelCreditsLoad ??= fetchCreditsIndex()
    .then(index => {
      creditsG.__reelCredits = { at: Date.now(), index }
      return index
    })
    .catch(err => {
      if (creditsG.__reelCredits) creditsG.__reelCredits.at = Date.now()
      throw err
    })
    .finally(() => { creditsG.__reelCreditsLoad = undefined })
  return creditsG.__reelCreditsLoad
}

async function getCreditsIndex(): Promise<CreditsIndex> {
  const cached = creditsG.__reelCredits
  if (cached && Date.now() - cached.at < CREDITS_TTL_MS) return cached.index
  const load = loadCreditsIndex()
  if (cached) {
    load.catch(() => {})
    return cached.index
  }
  // Credits are an enhancement: without them the catalog still renders, just without
  // person search / filters until the next refresh succeeds.
  return load.catch(() => new Map())
}

/** Credits with headshots, keyed by title id — for the search index (person rows). */
export async function getTitleCredits(): Promise<CreditsIndex> {
  if (isMockMode()) {
    const index: CreditsIndex = new Map()
    for (const item of Object.values(MOCK_JELLYFIN_ITEMS)) {
      const credits = creditsFromRaw(item.People)
      if (credits) index.set(item.Id, credits)
    }
    return index
  }
  return getCreditsIndex()
}

/** The catalog ships to library pages, so its credits carry no headshot URLs (those
    are only needed by Search, which reads them from getTitleCredits). */
function slimCredits(credits: ReelCredit[] | undefined): ReelCredit[] | undefined {
  return credits?.map(c => ({ id: c.id, name: c.name, ...(c.director && { director: c.director }) }))
}

/**
 * The whole library as ReelTitles — drives Home, Library, Picker, Search, Stats.
 * Throws JellyfinError when the server is unreachable (the media error page shows
 * that) rather than pretending the library is empty. Deduped per render.
 */
export const getCatalog = cache(async (): Promise<ReelTitle[]> => {
  if (isMockMode()) return mockCatalog()
  const [movies, series, credits] = await Promise.all([reelList('movies'), reelList('tv'), getCreditsIndex()])
  return [...movies, ...series].map(t => {
    const people = slimCredits(credits.get(t.id))
    return withArt(people ? { ...t, people } : t)
  })
})

/** Top titles (with artwork) for the rotating home hero, best-rated first. */
export async function getFeatured(catalog?: ReelTitle[]): Promise<ReelTitle[]> {
  const all = catalog ?? (await getCatalog())
  if (all.length === 0) return []
  const withBackdrop = all.filter(t => t.backdropUrl)
  const pool = withBackdrop.length ? withBackdrop : all
  return [...pool].sort((a, b) => (b.imdb ?? 0) - (a.imdb ?? 0)).slice(0, 6)
}

/** Continue-watching entries with progress + a contextual sub-label. */
export async function getReelResume(): Promise<ContinueItem[]> {
  if (isMockMode()) {
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
  const { userId } = await getSession()
  const data = await jfGet<{ Items: RawItem[] }>(`/Users/${enc(userId)}/Items/Resume`, {
    Limit: 12,
    MediaTypes: 'Video',
    Fields: 'ProductionYear,SeriesName,RunTimeTicks',
    ImageTypeLimit: 1,
    EnableImageTypes: 'Primary,Backdrop',
  }, { tags: [RESUME_TAG] })
  return data.Items.map(it => {
    const isEpisode = it.Type === 'Episode'
    const seriesId = it.SeriesId
    const hue = hueFromId(seriesId ?? it.Id)
    const minsLeft = ticksToMinutes((it.RunTimeTicks ?? 0) - (it.UserData?.PlaybackPositionTicks ?? 0)) ?? 0
    const epLabel =
      it.ParentIndexNumber != null && it.IndexNumber != null
        ? `S${it.ParentIndexNumber} · E${it.IndexNumber}`
        : undefined
    return {
      id: it.Id,
      href: isEpisode && seriesId ? `/media/tv/${seriesId}` : `/media/movies/${it.Id}`,
      title: isEpisode ? it.SeriesName ?? it.Name : it.Name,
      subtitle: isEpisode ? [epLabel, it.Name].filter(Boolean).join(' · ') : undefined,
      sub: minsLeft > 0 ? `${minsLeft}m left` : undefined,
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
}

export function fmtBytes(n?: number): string | undefined {
  if (!n) return undefined
  const gb = n / 1_073_741_824
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${Math.round(n / 1_048_576)} MB`
}

// --- Track listing (versions / audio / subtitles) --------------------------

const TEXT_SUB_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'vtt', 'text', 'microdvd'])

/** Text subtitles can be delivered as a sidecar VTT <track>; image subs must burn in. */
function isTextSubtitle(s: RawStream): boolean {
  if (typeof s.IsTextSubtitleStream === 'boolean') return s.IsTextSubtitleStream
  return TEXT_SUB_CODECS.has((s.Codec ?? '').toLowerCase())
}

function audioLabel(s: RawStream): string {
  if (s.DisplayTitle) return s.DisplayTitle
  const parts: string[] = []
  if (s.Language) parts.push(s.Language.toUpperCase())
  if (s.Codec) parts.push(s.Codec.toUpperCase())
  if (s.ChannelLayout) parts.push(s.ChannelLayout)
  else if (s.Channels) parts.push(`${s.Channels}ch`)
  return parts.join(' · ') || 'Audio'
}

function subtitleLabel(s: RawStream): string {
  if (s.DisplayTitle) return s.DisplayTitle
  const parts: string[] = []
  if (s.Language) parts.push(s.Language.toUpperCase())
  if (s.Codec) parts.push(s.Codec.toUpperCase())
  let label = parts.join(' · ') || 'Subtitle'
  if (s.IsForced) label += ' (Forced)'
  if (s.IsExternal) label += ' (External)'
  return label
}

/** Default audio stream index for a source (used to decide if a transcode is needed). */
function defaultAudioIndex(ms: RawMediaSource): number | undefined {
  if (ms.DefaultAudioStreamIndex != null) return ms.DefaultAudioStreamIndex
  const streams = ms.MediaStreams ?? []
  const def = streams.find(s => s.Type === 'Audio' && s.IsDefault) ?? streams.find(s => s.Type === 'Audio')
  return def?.Index
}

function versionFromSource(ms: RawMediaSource, idx: number): MediaVersion {
  const streams = ms.MediaStreams ?? []
  const v = streams.find(s => s.Type === 'Video')
  const audio = streams
    .filter(s => s.Type === 'Audio')
    .map(s => ({
      index: s.Index ?? 0,
      label: audioLabel(s),
      language: s.Language,
      codec: s.Codec,
      channels: s.ChannelLayout ?? (s.Channels ? `${s.Channels}ch` : undefined),
      isDefault: Boolean(s.IsDefault),
    }))
  const subtitles = streams
    .filter(s => s.Type === 'Subtitle')
    .map(s => ({
      index: s.Index ?? 0,
      label: subtitleLabel(s),
      language: s.Language,
      codec: s.Codec,
      isDefault: Boolean(s.IsDefault),
      isForced: Boolean(s.IsForced),
      isExternal: Boolean(s.IsExternal),
      isText: isTextSubtitle(s),
    }))
  const resolution = v?.Width && v?.Height ? `${v.Width}×${v.Height}` : undefined
  return {
    id: ms.Id,
    name: ms.Name || ms.Container?.toUpperCase() || resolution || `Version ${idx + 1}`,
    resolution,
    videoCodec: v?.Codec ? v.Codec.toUpperCase() : undefined,
    container: ms.Container?.toUpperCase(),
    size: fmtBytes(ms.Size),
    path: ms.Path,
    audio,
    subtitles,
    defaultAudioIndex: defaultAudioIndex(ms),
    defaultSubtitleIndex: ms.DefaultSubtitleStreamIndex ?? subtitles.find(s => s.isDefault)?.index,
  }
}

// PlaybackInfo is a POST (not fetch-cacheable), and a title's files rarely change, so
// the mapped result is cached for 10 minutes.
const cachedMediaInfo = unstable_cache(
  async (id: string): Promise<MediaInfo | null> => {
    const { userId } = await getSession()
    // PlaybackInfo reliably returns MediaSources with full MediaStreams (the GET
    // item endpoint often omits them) — same source getPlayback uses.
    const res = await jfPost(`/Items/${enc(id)}/PlaybackInfo`, { UserId: userId }, { userId })
    if (!res.ok) return null
    const info = (await res.json()) as { MediaSources?: RawMediaSource[] }
    const sources = info.MediaSources ?? []
    return sources.length ? { versions: sources.map((ms, i) => versionFromSource(ms, i)) } : null
  },
  ['jf-mediainfo-v1', ...CACHE_KEY],
  { revalidate: 600, tags: ['jf-mediainfo'] },
)

/** Versions + audio/subtitle tracks for the detail page (and player) of a playable item. */
export async function getMediaInfo(id: string): Promise<MediaInfo | null> {
  if (isMockMode()) return mockMediaInfo(id)
  if (!isItemId(id)) return null
  try {
    return await cachedMediaInfo(id)
  } catch {
    return null
  }
}

/** Dev/no-server fallback: a multi-version title with English/Japanese audio + subtitles. */
function mockMediaInfo(id: string): MediaInfo {
  return {
    versions: [
      {
        id: `${id}-v1`,
        name: '4K HDR Remux',
        resolution: '3840×2160',
        videoCodec: 'HEVC',
        container: 'MKV',
        size: '48.2 GB',
        path: `/media/${id}/2160p.mkv`,
        audio: [
          { index: 1, label: 'English · TrueHD Atmos · 7.1', language: 'eng', codec: 'truehd', channels: '7.1', isDefault: true },
          { index: 2, label: 'Japanese · DTS-HD MA · 5.1', language: 'jpn', codec: 'dts', channels: '5.1', isDefault: false },
          { index: 3, label: 'English · AC3 · 2.0 (Commentary)', language: 'eng', codec: 'ac3', channels: '2.0', isDefault: false },
        ],
        subtitles: [
          { index: 4, label: 'English', language: 'eng', codec: 'subrip', isDefault: true, isForced: false, isExternal: false, isText: true },
          { index: 5, label: 'English (Forced)', language: 'eng', codec: 'subrip', isDefault: false, isForced: true, isExternal: false, isText: true },
          { index: 6, label: 'Spanish', language: 'spa', codec: 'subrip', isDefault: false, isForced: false, isExternal: true, isText: true },
        ],
        defaultAudioIndex: 1,
      },
      {
        id: `${id}-v2`,
        name: '1080p',
        resolution: '1920×1080',
        videoCodec: 'H264',
        container: 'MP4',
        size: '8.6 GB',
        path: `/media/${id}/1080p.mp4`,
        audio: [
          { index: 1, label: 'English · AAC · 5.1', language: 'eng', codec: 'aac', channels: '5.1', isDefault: true },
          { index: 2, label: 'Japanese · AAC · 2.0', language: 'jpn', codec: 'aac', channels: '2.0', isDefault: false },
        ],
        subtitles: [
          { index: 3, label: 'English', language: 'eng', codec: 'subrip', isDefault: false, isForced: false, isExternal: false, isText: true },
        ],
        defaultAudioIndex: 1,
      },
    ],
  }
}

/**
 * Fetch a text subtitle as WebVTT, proxied through this server so the player can use it
 * as a same-origin <track> (no cross-origin track CORS; the token stays server-side).
 */
export async function fetchSubtitleVtt(itemId: string, mediaSourceId: string, index: number): Promise<string | null> {
  if (isMockMode()) return null
  try {
    const res = await jfFetch(`/Videos/${enc(itemId)}/${enc(mediaSourceId)}/Subtitles/${index}/0/Subtitles.vtt`, {
      headers: { Accept: 'text/vtt' },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Collections (BoxSets)
// ---------------------------------------------------------------------------

type CachedCollection = CollectionSummary & { artPool: string[] }

const cachedBoxSets = unstable_cache(
  async (): Promise<CachedCollection[]> => {
    const { userId } = await getSession()
    const data = await jfJson<{ Items: RawItem[] }>('/Items', {
      params: { userId, IncludeItemTypes: 'BoxSet', Recursive: true, SortBy: 'SortName', Fields: 'Overview' },
    })
    // Members need one query per BoxSet; keep at most 4 in flight.
    return mapLimit(data.Items, 4, async bs => {
      const members = await jfJson<{ Items: RawItem[] }>('/Items', {
        params: { userId, ParentId: bs.Id, SortBy: 'PremiereDate,ProductionYear', Fields: 'ProductionYear', ImageTypeLimit: 1, EnableImageTypes: 'Primary,Backdrop' },
      }).catch(() => ({ Items: [] as RawItem[] }))
      const artPool = members.Items
        .map(m => m.BackdropImageTags?.[0]
          ? imageUrl(m.Id, 'Backdrop', { tag: m.BackdropImageTags[0], maxWidth: 1280, quality: 90 })
          : m.ImageTags?.Primary
            ? imageUrl(m.Id, 'Primary', { tag: m.ImageTags.Primary, maxWidth: 780, quality: 90 })
            : undefined)
        .filter((u): u is string => Boolean(u))
        .slice(0, 24)
      return {
        id: bs.Id,
        name: bs.Name,
        hue: hueFromId(bs.Id),
        tagline: bs.Overview,
        itemIds: members.Items.map(m => m.Id),
        artPool,
        backdropUrl: bs.BackdropImageTags?.[0]
          ? imageUrl(bs.Id, 'Backdrop', { tag: bs.BackdropImageTags[0], maxWidth: 3840, quality: 90 })
          : undefined,
        posterUrl: bs.ImageTags?.Primary
          ? imageUrl(bs.Id, 'Primary', { tag: bs.ImageTags.Primary, maxWidth: 600 })
          : undefined,
        logoUrl: bs.ImageTags?.Logo
          ? imageUrl(bs.Id, 'Logo', { tag: bs.ImageTags.Logo, maxWidth: 600 })
          : undefined,
      }
    })
  },
  ['jf-boxsets-v2', ...CACHE_KEY],
  { tags: [COLLECTIONS_TAG], revalidate: 300 },
)

/** All Jellyfin collections (BoxSets) with their member title ids — franchises + user-made.
    Throws JellyfinError when the server is unreachable. Deduped per render. */
export const getBoxSets = cache(async (): Promise<CollectionSummary[]> => {
  if (isMockMode()) return mockStore().slice()
  const sets = await cachedBoxSets()
  return sets.map(({ artPool, ...c }) => {
    // Random sample (Fisher–Yates) per request so the hero montage varies.
    const art = [...artPool]
    for (let i = art.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[art[i], art[j]] = [art[j], art[i]]
    }
    return { ...c, montageUrls: art.slice(0, 6) }
  })
})

/** Dev/no-server fallback: a couple of grouped mock collections by shared genre. */
function mockCollections(): CollectionSummary[] {
  const cat = mockCatalog()
  const byGenre = (genre: string) => cat.filter(t => t.genres.includes(genre)).map(t => t.id)
  return [
    { id: 'mock-scifi', name: 'Science Fiction', hue: 210, tagline: 'Worlds beyond ours.', itemIds: byGenre('Science Fiction') },
    { id: 'mock-drama', name: 'Drama', hue: 30, tagline: 'Stories that linger.', itemIds: byGenre('Drama') },
  ].filter(c => c.itemIds.length > 0)
}

// In-memory collection store for mock mode so create/add/remove/delete behave during a
// session. Resets on server restart. Survives hot reloads via globalThis.
const mockG = globalThis as unknown as { __mockCollections?: CollectionSummary[] }
function mockStore(): CollectionSummary[] {
  if (!mockG.__mockCollections) mockG.__mockCollections = mockCollections()
  return mockG.__mockCollections
}

function bustCollections() {
  revalidateTag(COLLECTIONS_TAG, { expire: 0 })
}

/** True when `id` is a BoxSet — writes must never touch (let alone delete) a movie/series. */
async function isBoxSet(id: string): Promise<boolean> {
  if (!JF_ID.test(id)) return false
  const { userId } = await getSession()
  const item = await jfJson<{ Type?: string }>(`/Items/${enc(id)}`, { params: { userId } }).catch(() => null)
  return item?.Type === 'BoxSet'
}

/** Create a collection (optionally seeded with item ids); returns the new collection id. */
export async function createCollection(name: string, ids: string[] = []): Promise<string | null> {
  const clean = name.trim().slice(0, 200) || 'Untitled'
  if (isMockMode()) {
    const id = `mock-cc-${mockStore().length + 1}-${clean.toLowerCase().replace(/[^\w]+/g, '-')}`.slice(0, 80)
    mockStore().push({ id, name: clean, hue: hueFromId(id), itemIds: [...ids] })
    return id
  }
  try {
    const { userId } = await getSession()
    const res = await jfPost('/Collections', undefined, { userId, name: clean, ids: ids.length ? ids.join(',') : undefined })
    if (!res.ok) return null
    const data = (await res.json()) as { Id?: string }
    bustCollections()
    return data.Id ?? null
  } catch {
    return null
  }
}

/** Add titles to a collection. */
export async function addToCollection(collectionId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true
  if (isMockMode()) {
    const c = mockStore().find(x => x.id === collectionId)
    if (c) c.itemIds = [...new Set([...c.itemIds, ...ids])]
    return Boolean(c)
  }
  try {
    if (!(await isBoxSet(collectionId))) return false
    const { userId } = await getSession()
    const res = await jfPost(`/Collections/${enc(collectionId)}/Items`, undefined, { userId, ids: ids.join(',') })
    if (res.ok) bustCollections()
    return res.ok
  } catch {
    return false
  }
}

/** Remove titles from a collection. */
export async function removeFromCollection(collectionId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true
  if (isMockMode()) {
    const c = mockStore().find(x => x.id === collectionId)
    if (c) c.itemIds = c.itemIds.filter(i => !ids.includes(i))
    return Boolean(c)
  }
  try {
    if (!(await isBoxSet(collectionId))) return false
    const res = await jfDelete(`/Collections/${enc(collectionId)}/Items`, { ids: ids.join(',') })
    if (res.ok) bustCollections()
    return res.ok
  } catch {
    return false
  }
}

/** Rename a collection. Jellyfin has no rename endpoint, so fetch the BoxSet, change its Name, and post it back. */
export async function renameCollection(collectionId: string, name: string): Promise<boolean> {
  const clean = name.trim().slice(0, 200)
  if (!clean) return false
  if (isMockMode()) {
    const c = mockStore().find(x => x.id === collectionId)
    if (c) c.name = clean
    return Boolean(c)
  }
  try {
    const { userId } = await getSession()
    const item = await jfJson<Record<string, unknown> & { Type?: string }>(`/Items/${enc(collectionId)}`, { params: { userId } })
    if (item.Type !== 'BoxSet') return false
    const res = await jfPost(`/Items/${enc(collectionId)}`, { ...item, Name: clean })
    if (res.ok) bustCollections()
    return res.ok
  } catch {
    return false
  }
}

/** Delete an entire collection — only ever a BoxSet item, never the titles in it. */
export async function deleteCollection(collectionId: string): Promise<boolean> {
  if (isMockMode()) {
    const s = mockStore()
    const idx = s.findIndex(x => x.id === collectionId)
    if (idx >= 0) s.splice(idx, 1)
    return idx >= 0
  }
  try {
    if (!(await isBoxSet(collectionId))) return false
    const res = await jfDelete(`/Items/${enc(collectionId)}`)
    if (res.ok) bustCollections()
    return res.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Detail pages
// ---------------------------------------------------------------------------

/** Deduped names of people of a given crew Type (e.g. 'Director', 'Writer'). */
function peopleNames(
  people: ReadonlyArray<{ Name: string; Type?: string }> | undefined,
  type: string,
  limit = 6,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of people ?? []) {
    if (p.Type === type && p.Name && !seen.has(p.Name)) {
      seen.add(p.Name)
      out.push(p.Name)
      if (out.length >= limit) break
    }
  }
  return out
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

/** One season + its episodes in the UI shape — shared by the mock and Jellyfin paths. */
function toSeasonInfo(
  s: { id: string; name: string; index: number; year?: number; posterUrl?: string },
  episodes: { Id: string; Name: string; IndexNumber?: number; Overview?: string; RunTimeTicks?: number; imageUrl?: string; UserData?: RawUserData }[],
): ReelSeasonInfo {
  return {
    id: s.id,
    name: s.name,
    index: s.index,
    episodeCount: episodes.length,
    year: s.year,
    hue: hueFromId(s.id),
    posterUrl: s.posterUrl,
    episodes: episodes.map(e => ({
      id: e.Id,
      name: e.Name,
      index: e.IndexNumber ?? 0,
      overview: e.Overview,
      runtime: ticksToMinutes(e.RunTimeTicks),
      hue: hueFromId(e.Id),
      imageUrl: e.imageUrl,
      played: Boolean(e.UserData?.Played),
      progress: progressOf(e),
    })),
  }
}

function mockDetail(item: JellyfinItem): ReelDetail {
  const base = mockToReel(item)
  const seasonList = item.Seasons?.map(s => toSeasonInfo(
    { id: s.Id, name: s.Name, index: s.IndexNumber, year: s.ProductionYear, posterUrl: s.posterUrl },
    s.Episodes ?? [],
  ))
  const director = item.People.find(p => p.Type === 'Director')
  return {
    ...base,
    studios: (item.Studios ?? []).map(s => s.Name),
    cast: item.People.slice(0, 20).map(p => ({
      id: p.Id, name: p.Name, role: p.Role, isDirector: p.Type === 'Director', hue: hueFromId(p.Id),
    })),
    createdBy: director?.Name,
    directors: peopleNames(item.People, 'Director'),
    writers: peopleNames(item.People, 'Writer'),
    seasonList,
    trailer: pickTrailer(item, []),
  }
}

/** Locate a mock episode inside the seasons of any mock series and build a movie-like
    detail for it, borrowing the series' cast/studios/genres so dev mode looks populated. */
function mockEpisodeDetail(episodeId: string): ReelEpisodeDetail | null {
  for (const item of Object.values(MOCK_JELLYFIN_ITEMS)) {
    if (item.Type !== 'Series' || !item.Seasons) continue
    for (const s of item.Seasons) {
      const e = s.Episodes?.find(ep => ep.Id === episodeId)
      if (!e) continue
      const series = mockDetail(item)
      const hue = hueFromId(e.Id)
      return {
        ...series,
        id: e.Id,
        title: e.Name,
        type: 'tv',
        runtime: ticksToMinutes(e.RunTimeTicks),
        seasons: undefined,
        episodes: undefined,
        seasonList: undefined,
        hue,
        synopsis: e.Overview,
        backdropUrl: e.imageUrl,
        posterColor: posterArt(hue),
        backdropColor: backdropArt(hue),
        seriesId: item.Id,
        seriesName: item.Name,
        seasonId: s.Id,
        seasonName: s.Name,
        seasonIndex: s.IndexNumber,
        episodeIndex: e.IndexNumber,
      }
    }
  }
  return null
}

/** Full detail for a single episode — the same rich model as a movie, plus series/season
    context. Episode items often omit Genres/Studios/cast (those live on the series), so the
    caller (EpisodeDetail) falls back to the series-level fields. null → not found;
    throws when the server is unreachable. */
export const getReelEpisodeDetail = cache(async (episodeId: string): Promise<ReelEpisodeDetail | null> => {
  if (isMockMode()) return mockEpisodeDetail(episodeId)
  if (!isItemId(episodeId)) return null
  let raw: RawItem
  try {
    const { userId } = await getSession()
    // Uncached: UserData (watched / resume position) must be current.
    raw = await jfJson<RawItem>(`/Items/${enc(episodeId)}`, {
      params: {
        userId,
        Fields:
          'Overview,Genres,People,Studios,Taglines,Tags,ProductionYear,CommunityRating,CriticRating,DateCreated,SeriesName,SeriesId,SeasonId,SeasonName,IndexNumber,ParentIndexNumber,PremiereDate',
      },
    })
  } catch (e) {
    if (isNotFound(e)) return null
    throw e
  }
  if (raw.Type !== 'Episode') return null
  const base = toReelTitle(raw, 'tv')
  const premiereYear = raw.PremiereDate ? new Date(raw.PremiereDate).getFullYear() : undefined
  const director = (raw.People ?? []).find(p => p.Type === 'Director')
  return {
    ...base,
    // An episode's hero is its still (Primary image), not a landscape Backdrop.
    backdropUrl: raw.ImageTags?.Primary
      ? imageUrl(episodeId, 'Primary', { tag: raw.ImageTags.Primary, maxWidth: 3840, quality: 90 })
      : base.backdropUrl,
    // ChildCount/RecursiveItemCount are meaningless for an episode; runtime is the episode's own.
    runtime: ticksToMinutes(raw.RunTimeTicks),
    seasons: undefined,
    episodes: undefined,
    year: raw.ProductionYear ?? premiereYear,
    studios: (raw.Studios ?? []).map(s => s.Name),
    cast: castFromRaw(raw.People),
    createdBy: director?.Name,
    directors: peopleNames(raw.People, 'Director'),
    writers: peopleNames(raw.People, 'Writer'),
    seriesId: raw.SeriesId ?? '',
    seriesName: raw.SeriesName ?? '',
    seasonId: raw.SeasonId ?? '',
    seasonName: raw.SeasonName ?? '',
    seasonIndex: raw.ParentIndexNumber ?? 0,
    episodeIndex: raw.IndexNumber ?? 0,
  }
})

/** Seasons + every episode of a series in two queries (not one per season), with the
    user's played/progress state — uncached, it changes as you watch. */
async function getSeasons(seriesId: string, userId: string): Promise<ReelSeasonInfo[]> {
  const [seasons, episodes] = await Promise.all([
    jfJson<{ Items: RawItem[] }>(`/Shows/${enc(seriesId)}/Seasons`, {
      params: { userId, Fields: 'ProductionYear', EnableImageTypes: 'Primary', ImageTypeLimit: 1 },
    }),
    jfJson<{ Items: RawItem[] }>(`/Shows/${enc(seriesId)}/Episodes`, {
      params: { userId, Fields: 'Overview', EnableImageTypes: 'Primary', ImageTypeLimit: 1, EnableUserData: true },
    }),
  ])
  const bySeason = new Map<string, RawItem[]>()
  for (const e of episodes.Items) {
    if (!e.SeasonId) continue
    const list = bySeason.get(e.SeasonId) ?? []
    list.push(e)
    bySeason.set(e.SeasonId, list)
  }
  return seasons.Items.map(s => toSeasonInfo(
    {
      id: s.Id,
      name: s.Name,
      index: s.IndexNumber ?? 0,
      year: s.ProductionYear,
      posterUrl: s.ImageTags?.Primary ? imageUrl(s.Id, 'Primary', { tag: s.ImageTags.Primary, maxWidth: 360 }) : undefined,
    },
    (bySeason.get(s.Id) ?? []).map(e => ({
      ...e,
      imageUrl: e.ImageTags?.Primary ? imageUrl(e.Id, 'Primary', { tag: e.ImageTags.Primary, maxWidth: 960 }) : undefined,
    })),
  ))
}

/** Jellyfin's Next Up episode for a series (uncached). */
async function getNextUp(seriesId: string, userId: string): Promise<ReelDetail['nextUp']> {
  const data = await jfJson<{ Items: RawItem[] }>('/Shows/NextUp', {
    params: { SeriesId: seriesId, UserId: userId, Limit: 1, EnableUserData: false, ImageTypeLimit: 0 },
  }).catch(() => null)
  const ep = data?.Items?.[0]
  return ep?.SeasonId ? { seasonId: ep.SeasonId, episodeId: ep.Id } : undefined
}

/** Full detail view model for movie/series detail pages. null → not found; throws when
    the server is unreachable. Deduped per render (generateMetadata + page). */
export const getReelDetail = cache(async (id: string): Promise<ReelDetail | null> => {
  if (isMockMode()) {
    const mock = MOCK_JELLYFIN_ITEMS[id]
    return mock ? mockDetail(mock) : null
  }
  if (!isItemId(id)) return null
  let raw: RawItem
  let localTrailers: RawItem[] = []
  let userId: string
  try {
    userId = (await getSession()).userId
    ;[raw, localTrailers] = await Promise.all([
      // Uncached: UserData (resume position, watched, favorite) must be current.
      jfJson<RawItem>(`/Items/${enc(id)}`, {
        params: { userId, Fields: 'Overview,Genres,People,Studios,Taglines,Tags,ProductionYear,CommunityRating,CriticRating,DateCreated,RemoteTrailers,ChildCount,RecursiveItemCount' },
      }),
      fetchLocalTrailers(id, userId),
    ])
  } catch (e) {
    if (isNotFound(e)) return null
    throw e
  }
  if (raw.Type !== 'Movie' && raw.Type !== 'Series') return null
  const kind = raw.Type === 'Series' ? 'tv' : 'movies'
  const base = toReelTitle(raw, kind)
  const director = (raw.People ?? []).find(p => p.Type === 'Director')
  const detail: ReelDetail = {
    ...base,
    studios: (raw.Studios ?? []).map(s => s.Name),
    cast: castFromRaw(raw.People),
    createdBy: director?.Name,
    directors: peopleNames(raw.People, 'Director'),
    writers: peopleNames(raw.People, 'Writer'),
    trailer: pickTrailer(raw, localTrailers),
  }
  if (kind === 'tv') {
    try {
      const [seasons, nextUp] = await Promise.all([getSeasons(id, userId), getNextUp(id, userId)])
      const seasonList = seasons.filter(s => s.episodeCount > 0)
      detail.seasonList = seasonList
      detail.seasons = seasonList.length
      detail.episodes = seasonList.reduce((a, s) => a + s.episodeCount, 0)
      detail.nextUp = nextUp
    } catch {
      /* leave seasons undefined — the page still renders */
    }
  }
  return detail
})

/** "More like this" as ReelTitles (similar items can be either type). */
export async function getReelSimilar(id: string): Promise<ReelTitle[]> {
  if (isMockMode()) return mockCatalog().filter(t => t.id !== id).slice(0, 12)
  if (!isItemId(id)) return []
  try {
    const { userId } = await getSession()
    const data = await jfGet<{ Items: RawItem[] }>(`/Items/${enc(id)}/Similar`, { userId, limit: 12, Fields: REEL_FIELDS })
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
export const getPerson = cache(async (id: string): Promise<ReelPerson | null> => {
  if (isMockMode()) return mockPerson(id)
  if (!isItemId(id)) return null
  let raw: RawItem
  let userId: string
  try {
    userId = (await getSession()).userId
    raw = await jfJson<RawItem>(`/Items/${enc(id)}`, {
      params: { userId, Fields: 'Overview', EnableImageTypes: 'Primary', ImageTypeLimit: 1 },
      revalidate: 300,
    })
  } catch (e) {
    if (isNotFound(e)) return null
    throw e
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
    ImageTypeLimit: 1,
    Limit: 500,
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

  return {
    id,
    name: raw.Name,
    overview: raw.Overview,
    hue: hueFromId(id),
    imageUrl: raw.ImageTags?.Primary ? imageUrl(id, 'Primary', { tag: raw.ImageTags.Primary, maxWidth: 400 }) : undefined,
    filmography,
    episodes,
  }
})

// ---------------------------------------------------------------------------
// Favorites + played (write-through from the client MediaProvider)
// ---------------------------------------------------------------------------

function bustUserData() {
  revalidateTag(CATALOG_TAG, { expire: 0 })
  revalidateTag(RESUME_TAG, { expire: 0 })
}

/** POST/DELETE on the 10.9+ route, falling back to the legacy /Users/{id}/… route. */
async function toggleUserFlag(modern: string, legacy: (userId: string) => string, on: boolean): Promise<boolean> {
  const { userId } = await getSession()
  const method = on ? 'POST' : 'DELETE'
  let res = await jfFetch(modern, { method, params: { userId } })
  if (res.status === 404 || res.status === 405) res = await jfFetch(legacy(enc(userId)), { method })
  return res.ok
}

/** Mark/unmark an item as a favorite of the dashboard user. Mock mode → 'local'. */
export async function setFavorite(id: string, on: boolean): Promise<'ok' | 'local' | 'failed'> {
  if (isMockMode()) return 'local'
  try {
    const ok = await toggleUserFlag(`/UserFavoriteItems/${enc(id)}`, u => `/Users/${u}/FavoriteItems/${enc(id)}`, on)
    if (ok) bustUserData()
    return ok ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

/** Mark an item played (true) or unplayed (false — also clears its resume position). */
export async function setPlayed(id: string, on: boolean): Promise<'ok' | 'local' | 'failed'> {
  if (isMockMode()) return 'local'
  try {
    const ok = await toggleUserFlag(`/UserPlayedItems/${enc(id)}`, u => `/Users/${u}/PlayedItems/${enc(id)}`, on)
    if (ok) bustUserData()
    return ok ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

/**
 * Clear the Played flag while keeping (setting) the resume position. Jellyfin marks an
 * audiobook Played when a stop lands near its end and never clears it on later progress
 * reports; DELETE /UserPlayedItems would also zero the position, so write UserData
 * directly (10.9+: POST /UserItems/{id}/UserData; older: /Users/{u}/Items/{id}/UserData).
 */
export async function setResumePoint(id: string, seconds: number): Promise<'ok' | 'local' | 'failed'> {
  if (isMockMode()) return 'local'
  try {
    const { userId } = await getSession()
    const json = { Played: false, PlaybackPositionTicks: Math.max(0, Math.round(seconds * 10_000_000)) }
    let res = await jfFetch(`/UserItems/${enc(id)}/UserData`, { method: 'POST', params: { userId }, json })
    if (res.status === 404 || res.status === 405) {
      res = await jfFetch(`/Users/${enc(userId)}/Items/${enc(id)}/UserData`, { method: 'POST', json })
    }
    if (res.ok) bustUserData()
    return res.ok ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

/** Clear an item's resume position (mark it unplayed) so it leaves Continue Watching. */
export async function clearResumeProgress(itemId: string): Promise<boolean> {
  return (await setPlayed(itemId, false)) !== 'failed'
}

// ---------------------------------------------------------------------------
// Playback resolution + reporting
// ---------------------------------------------------------------------------

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
export const BROWSER_PROFILE = {
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

export interface PlaybackOptions {
  forceHls?: boolean
  mediaSourceId?: string
  audioStreamIndex?: number
  subtitleStreamIndex?: number
}

/** Mock mode: a well-formed (unplayable) source so the player UI can be exercised. */
function mockPlayback(itemId: string, opts: PlaybackOptions): PlaybackSource {
  const mediaSourceId = opts.mediaSourceId ?? `${itemId}-v1`
  return {
    itemId,
    method: 'direct',
    url: directStream('Videos', itemId, 'mp4', { mediaSourceId, PlaySessionId: 'mock' }).url,
    mediaSourceId,
    playSessionId: 'mock',
    positionTicks: 0,
    runtimeTicks: 0,
    transcoding: false,
    playMethodLabel: 'Direct Play (mock)',
    audioStreamIndex: opts.audioStreamIndex,
    subtitleStreamIndex: opts.subtitleStreamIndex,
  }
}

export async function getPlayback(itemId: string, opts: PlaybackOptions = {}): Promise<PlaybackSource | null> {
  if (isMockMode()) return mockPlayback(itemId, opts)
  if (!isItemId(itemId)) return null
  const { userId } = await getSession()

  // Ambient clips pass series ids, but a series has no MediaSources of its own —
  // represent the show with a random episode. The item is fetched UNCACHED anyway for
  // the resume position further down (a cached copy restarted Resume at 0:00).
  const item = await jfJson<RawItem>(`/Items/${enc(itemId)}`, { params: { userId } }).catch(() => null)
  if (item?.Type === 'Series') {
    const eps = await jfJson<{ Items: RawItem[] }>(`/Shows/${enc(itemId)}/Episodes`, { params: { userId }, revalidate: 300 }).catch(() => null)
    const playable = eps?.Items?.filter(e => e.Id) ?? []
    const pick = playable[Math.floor(Math.random() * playable.length)]
    return pick ? getPlayback(pick.Id, opts) : null
  }

  // Send a real browser device profile so Jellyfin only reports DirectPlay when the
  // browser can actually decode the file. For DTS/AC3 audio or MKV it instead returns a
  // TranscodingUrl that copies the H.264 video and transcodes the audio to AAC. Passing
  // MediaSourceId/AudioStreamIndex makes that TranscodingUrl honor the chosen version/audio.
  const body: Record<string, unknown> = {
    UserId: userId,
    DeviceProfile: BROWSER_PROFILE,
    MaxStreamingBitrate: 120_000_000,
  }
  if (opts.mediaSourceId) body.MediaSourceId = opts.mediaSourceId
  if (opts.audioStreamIndex != null) body.AudioStreamIndex = opts.audioStreamIndex

  const res = await jfPost(`/Items/${enc(itemId)}/PlaybackInfo`, body, { userId })
  if (!res.ok) return null
  const info = (await res.json()) as { PlaySessionId: string; MediaSources?: RawMediaSource[] }
  const ms =
    (opts.mediaSourceId && info.MediaSources?.find(s => s.Id === opts.mediaSourceId)) ||
    info.MediaSources?.[0]
  if (!ms) return null

  // A subtitle index here means "burn it into the video" — used for image subs (PGS/VOBSUB)
  // that can't become VTT. Text subtitles are overlaid client-side as a sidecar <track>
  // (see /api/jellyfin/subtitle), so the player never sends those to this endpoint.
  const burnInSub = opts.subtitleStreamIndex != null

  const common = {
    itemId,
    mediaSourceId: ms.Id,
    playSessionId: info.PlaySessionId,
    positionTicks: item?.UserData?.PlaybackPositionTicks ?? 0,
    runtimeTicks: ms.RunTimeTicks ?? 0,
    audioStreamIndex: opts.audioStreamIndex,
    subtitleStreamIndex: opts.subtitleStreamIndex,
  }

  // A non-default audio track can't be switched during browser direct play, and a
  // burned-in subtitle needs the video re-encoded — either forces an HLS transcode.
  const audioForcesHls = opts.audioStreamIndex != null && opts.audioStreamIndex !== defaultAudioIndex(ms)
  const mustHls = Boolean(opts.forceHls) || audioForcesHls || burnInSub

  // Truly browser-compatible → the original bytes, streamed straight through the proxy
  // (Range passed on, no buffering — ≈0 server CPU).
  if (!mustHls && ms.SupportsDirectPlay) {
    return {
      ...common,
      method: 'direct',
      transcoding: false,
      playMethodLabel: 'Direct Play',
      url: directStream('Videos', itemId, ms.Container || 'mp4', { mediaSourceId: ms.Id, PlaySessionId: info.PlaySessionId }).url,
    }
  }

  // Otherwise transcode/remux over HLS. Prefer Jellyfin's computed URL (it already
  // reflects the version + audio we sent), unless we must inject a burned-in subtitle
  // — its URL won't include SubtitleStreamIndex, so build the master playlist ourselves.
  const transcoding = { transcoding: true, playMethodLabel: transcodeDetail(ms) } as const
  if (ms.TranscodingUrl && !burnInSub) {
    return { ...common, ...transcoding, method: 'hls', url: proxied(ms.TranscodingUrl) }
  }
  return {
    ...common,
    ...transcoding,
    method: 'hls',
    url: proxied(`/Videos/${enc(itemId)}/master.m3u8`, {
      mediaSourceId: ms.Id,
      PlaySessionId: info.PlaySessionId,
      VideoCodec: 'h264',
      AudioCodec: 'aac',
      AudioStreamIndex: opts.audioStreamIndex,
      SubtitleStreamIndex: burnInSub ? opts.subtitleStreamIndex : undefined,
      SubtitleMethod: burnInSub ? 'Encode' : undefined,
    }),
  }
}

/** Kill this device's server-side transcode for a play session (e.g. when the hover
    preview ends). Purely stops ffmpeg — never touches watch state or resume position. */
export async function stopEncoding(playSessionId: string): Promise<void> {
  if (isMockMode()) return
  await jfDelete('/Videos/ActiveEncodings', { deviceId: DEVICE_ID, playSessionId }).catch(() => { })
}

const REPORT_PATHS: Record<ReportKind, string> = {
  start: '/Sessions/Playing',
  progress: '/Sessions/Playing/Progress',
  stopped: '/Sessions/Playing/Stopped',
}

/** Forward a playback report. A stop moves the resume point / played state, so the
    Continue Watching row and the catalog's progress are refreshed. */
export async function reportPlayback(kind: ReportKind, body: PlaybackReport): Promise<boolean> {
  if (isMockMode()) return true
  const res = await jfPost(REPORT_PATHS[kind], body).catch(() => null)
  if (kind === 'stopped') bustUserData()
  return Boolean(res?.ok)
}
