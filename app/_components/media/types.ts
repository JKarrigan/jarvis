/** Client-safe media types shared by the SSR mappers (lib/jellyfinServer.ts) and the UI. */

export interface ReelTitle {
  id: string
  title: string
  year?: number
  type: 'movie' | 'tv'
  genres: string[]
  /** Movies only: runtime in minutes. */
  runtime?: number
  /** TV only. */
  seasons?: number
  episodes?: number
  /** Community rating, 0–10 (Jellyfin CommunityRating). */
  imdb?: number
  /** Critics score, 0–100 (Jellyfin CriticRating). */
  rt?: number
  /** Content certificate (Jellyfin OfficialRating). */
  cert?: string
  /** 0–360, drives all gradient artwork. */
  hue: number
  /** Days since added to the library (calendar days). */
  added?: number
  /** Epoch ms when added — precise recency ordering (`added` is the rounded day count). */
  addedAt?: number
  /** Watch progress 0–1 (from Jellyfin UserData; client overlay may refine). */
  progress: number
  /** Server seed — true if Jellyfin marks it Played. */
  watched: boolean
  /** Server seed — true if Jellyfin marks it a favorite. */
  favorite: boolean
  badge?: string
  posterUrl?: string
  backdropUrl?: string
  posterColor: string
  backdropColor: string
  synopsis?: string
  /** Short one-liner shown above the synopsis (Jellyfin Taglines[0]). */
  tagline?: string
  /** Free-form tags (Jellyfin Tags). */
  tags?: string[]
}

/** A Continue-watching entry (movie in progress, or a show's next/in-progress episode). */
export interface ContinueItem {
  id: string
  href: string
  title: string
  /** Secondary line — e.g. "S2 · E5 · Episode title" for episodes. */
  subtitle?: string
  /** Badge over the art — time/progress remaining. */
  sub?: string
  progress: number
  hue: number
  posterUrl?: string
  backdropUrl?: string
  backdropColor: string
}

/** File technical details for the detail page. */
export interface FileInfo {
  resolution?: string
  videoCodec?: string
  audio?: string
  container?: string
  size?: string
  path?: string
}

/** A single selectable audio track within a media version. */
export interface AudioTrack {
  /** Stream index within the source's MediaStreams (the Jellyfin AudioStreamIndex). */
  index: number
  label: string
  language?: string
  codec?: string
  channels?: string
  isDefault: boolean
}

/** A single selectable subtitle track within a media version. */
export interface SubtitleTrack {
  /** Stream index within the source's MediaStreams (the Jellyfin SubtitleStreamIndex). */
  index: number
  label: string
  language?: string
  codec?: string
  isDefault: boolean
  isForced: boolean
  isExternal: boolean
  /** Text subtitles (SRT/ASS/VTT) can be delivered as a sidecar <track>; image subs must burn in. */
  isText: boolean
}

/** One playable version of a title (a Jellyfin MediaSource) with its tracks. */
export interface MediaVersion {
  /** MediaSourceId — passed to playback as `mediaSourceId`. */
  id: string
  /** Version label (MediaSource.Name, else container/resolution). */
  name: string
  resolution?: string
  videoCodec?: string
  container?: string
  size?: string
  path?: string
  audio: AudioTrack[]
  subtitles: SubtitleTrack[]
  defaultAudioIndex?: number
  defaultSubtitleIndex?: number
}

/** All playable versions of a title (drives the detail-page pickers + player). */
export interface MediaInfo {
  versions: MediaVersion[]
}

export interface ReelCastMember {
  id: string
  name: string
  role?: string
  isDirector?: boolean
  hue: number
  imageUrl?: string
}

/** A single episode a person appears in (linkable to the episode detail). */
export interface ReelPersonEpisode {
  id: string
  name: string
  seriesId: string
  seriesName: string
  seasonId: string
  seasonIndex: number
  episodeIndex: number
  year?: number
  imageUrl?: string
  hue: number
}

/** A person (cast/crew) plus the library titles + episodes they appear in. */
export interface ReelPerson {
  id: string
  name: string
  overview?: string
  imageUrl?: string
  hue: number
  filmography: ReelTitle[]
  episodes: ReelPersonEpisode[]
}

export interface ReelEpisode {
  id: string
  name: string
  index: number
  overview?: string
  runtime?: number
  hue: number
  /** Episode thumbnail (Jellyfin Primary image). */
  imageUrl?: string
}

export interface ReelSeasonInfo {
  id: string
  name: string
  index: number
  episodeCount: number
  year?: number
  hue: number
  /** Season poster (Jellyfin Primary image). */
  posterUrl?: string
  episodes: ReelEpisode[]
}

/** A Jellyfin collection (BoxSet) — franchise or user-made — with its member title ids. */
export interface CollectionSummary {
  id: string
  name: string
  hue: number
  tagline?: string
  itemIds: string[]
  /** Collection's own artwork for the detail hero (the members supply a montage fallback). */
  backdropUrl?: string
  posterUrl?: string
  /** Collection logo (e.g. a studio/franchise wordmark) overlaid on the hero when present. */
  logoUrl?: string
  /** High-res member artwork for the hero montage (when the collection has no backdrop). */
  montageUrls?: string[]
}

/** Full detail view model (ReelTitle + cast/seasons/studios). */
export interface ReelDetail extends ReelTitle {
  studios: string[]
  cast: ReelCastMember[]
  createdBy?: string
  directors: string[]
  writers: string[]
  /** TV only: full season/episode structure (ReelTitle.seasons stays the count). */
  seasonList?: ReelSeasonInfo[]
}
