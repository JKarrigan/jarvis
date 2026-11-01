// Client-safe types for the Photos library. No server imports here.

export const PHOTO_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif', 'tiff'] as const
export const PHOTO_VIDEO_EXTS = ['mp4', 'mov', 'm4v', 'webm', 'mkv'] as const

export type PhotoImageExt = (typeof PHOTO_IMAGE_EXTS)[number]
export type PhotoVideoExt = (typeof PHOTO_VIDEO_EXTS)[number]
export type PhotoKind = 'image' | 'video'
export type ThumbSize = 't' | 'p'

/** Ids of photos and albums: 16 lowercase hex chars. */
export const PHOTO_ID_RE = /^[0-9a-f]{16}$/

export interface PhotoItem {
  id: string
  kind: PhotoKind
  /** Capture time (epoch ms), else file mtime. */
  takenAt: number
  /** Display dimensions, after EXIF orientation / video rotation is applied. */
  width: number | null
  height: number | null
  /** Seconds, videos only. */
  duration?: number
  favorite: boolean
  mime: string
  size: number
  /** Relative to PHOTOS_ROOT, '/' separated. `.trash/…` or `.missing/…` while trashed. */
  relPath: string
  albumIds?: string[]
  /** Free-form tags as typed (matched case-insensitively), sorted case-insensitively. */
  tags: string[]
  /** Set only for items in Recently deleted. */
  trashedAt?: number
  /** True when the row is trashed because the file disappeared (cannot be restored). */
  missing?: boolean
}

/** `GET /api/photos/[id]` — one item with full metadata and its albums. */
export interface PhotoDetail extends PhotoItem {
  camera: string | null
  lat: number | null
  lon: number | null
  mtime: number
  indexedAt: number
  albumIds: string[]
  albums: { id: string; name: string }[]
}

/** `GET /api/photos/tags` — one entry per tag on live items. */
export interface PhotoTagCount {
  tag: string
  count: number
}

export interface PhotoPage {
  items: PhotoItem[]
  /** Opaque keyset cursor for the next page, or null at the end. */
  nextCursor: string | null
}

export interface PhotoMonthCount {
  year: number
  /** 1–12 */
  month: number
  count: number
}

export interface PhotoYearCount {
  year: number
  count: number
}

export interface PhotoDiskUsage {
  /** Bytes of live (non-trashed) originals. */
  libraryBytes: number
  /** Bytes of originals waiting in Recently deleted. */
  trashBytes: number
  /** Filesystem holding PHOTOS_ROOT; 0 when unavailable (e.g. share offline). */
  totalBytes: number
  freeBytes: number
}

export interface PhotoSummary {
  total: number
  images: number
  videos: number
  favorites: number
  trashCount: number
  /** Newest first. Months/years are in the server's local time zone. */
  years: PhotoYearCount[]
  months: PhotoMonthCount[]
  diskUsage: PhotoDiskUsage
  /** Epoch ms of the last successfully finished scan, or null if never. */
  lastScan: number | null
  scanning: boolean
  libraryOnline: boolean
}

export interface Album {
  id: string
  name: string
  createdAt: number
  /** Explicit cover if set (and still in the album), else the newest item; null when empty. */
  coverId: string | null
  count: number
}

export type ScanPhase = 'idle' | 'walking' | 'indexing' | 'thumbnails'

export interface ScanStatus {
  running: boolean
  phase: ScanPhase
  startedAt: number | null
  finishedAt: number | null
  /** Epoch ms of the last scan that completed without error. */
  lastScan: number | null
  /** False when PHOTOS_ROOT is unreadable or the `.photos-library` marker is missing. */
  libraryOnline: boolean
  error: string | null
  /** Files found by the walk. */
  found: number
  /** Files whose metadata was (re)read in this scan. */
  processed: number
  added: number
  updated: number
  moved: number
  missing: number
  /** Rows restored from the NAS catalog (favorites + album memberships + tags). */
  catalogImported: number
  thumbsPending: number
  thumbsDone: number
}

export type UploadStatus = 'created' | 'duplicate' | 'error'

export interface UploadResult {
  /** Original file name as sent by the client. */
  name: string
  status: UploadStatus
  id?: string
  relPath?: string
  error?: string
}
