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
  /** Days since added to the library. */
  added?: number
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

/** A collection (Jellyfin BoxSet, or a user-made custom collection). */
export interface CollectionSummary {
  id: string
  name: string
  hue: number
  tagline?: string
  itemIds: string[]
  custom?: boolean
}

/** Full detail view model (ReelTitle + cast/seasons/studios). */
export interface ReelDetail extends ReelTitle {
  studios: string[]
  cast: ReelCastMember[]
  createdBy?: string
  /** TV only: full season/episode structure (ReelTitle.seasons stays the count). */
  seasonList?: ReelSeasonInfo[]
}
