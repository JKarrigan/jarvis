// File kinds for the Documents browser: extension → kind, and each kind's label,
// badge text and tone. React-free plain data (ported from GuardianPad's
// lib/fileKinds.js, keyed by extension because the files API has no content types).

export type FileKind =
  | 'folder' | 'pdf' | 'word' | 'excel' | 'powerpoint' | 'csv' | 'text'
  | 'image' | 'audio' | 'video' | 'archive' | 'other'

const EXT_KINDS: Record<Exclude<FileKind, 'folder' | 'other'>, string[]> = {
  pdf: ['pdf'],
  word: ['doc', 'docx', 'odt', 'rtf', 'pages', 'dotx'],
  excel: ['xls', 'xlsx', 'xlsm', 'ods', 'numbers'],
  powerpoint: ['ppt', 'pptx', 'odp', 'key'],
  csv: ['csv', 'tsv'],
  text: ['txt', 'md', 'markdown', 'log', 'json', 'xml', 'yaml', 'yml', 'ini', 'conf', 'cfg', 'srt', 'vtt', 'html', 'htm', 'css', 'js', 'ts', 'py', 'sh'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif', 'tif', 'tiff', 'bmp', 'svg'],
  audio: ['mp3', 'm4a', 'm4b', 'aac', 'wav', 'flac', 'ogg', 'opus', 'wma', 'aif', 'aiff'],
  video: ['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'mpg', 'mpeg', '3gp'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'dmg', 'iso'],
}

const BY_EXT = new Map<string, FileKind>()
for (const [kind, exts] of Object.entries(EXT_KINDS)) for (const e of exts) BY_EXT.set(e, kind as FileKind)

export interface KindMeta {
  label: string
  /** Short text on the icon's band ("PDF", "DOC"). Empty for glyph kinds. */
  badge: string
  /** Accent colour of the kind (icon band / glyph). */
  tone: string
}

/** Colour-coded like GuardianPad (PDF red, Word blue, Excel green, PowerPoint orange…), tuned for the dark Reel surfaces. */
const META: Record<FileKind, KindMeta> = {
  folder: { label: 'Folder', badge: '', tone: 'var(--accent)' },
  pdf: { label: 'PDF document', badge: 'PDF', tone: '#f06a6a' },
  word: { label: 'Word document', badge: 'DOC', tone: '#6f9bff' },
  excel: { label: 'Spreadsheet', badge: 'XLS', tone: '#4fcf8a' },
  powerpoint: { label: 'Presentation', badge: 'PPT', tone: '#f59e5b' },
  csv: { label: 'CSV', badge: 'CSV', tone: '#3fc7b0' },
  text: { label: 'Text', badge: 'TXT', tone: '#b9b4d6' },
  image: { label: 'Image', badge: '', tone: '#5cc8e6' },
  audio: { label: 'Audio', badge: '', tone: '#e58ad6' },
  video: { label: 'Video', badge: '', tone: '#b48cff' },
  archive: { label: 'Archive', badge: 'ZIP', tone: '#e0b25a' },
  other: { label: 'File', badge: '', tone: 'rgba(255,255,255,0.5)' },
}

/** "letters.final.pdf" → { stem: "letters.final", ext: ".pdf" }; ".env" and "notes" have no ext. */
export function splitName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return { stem: name, ext: '' }
  return { stem: name.slice(0, dot), ext: name.slice(dot) }
}

export function extOf(name: string): string {
  return splitName(name).ext.slice(1).toLowerCase()
}

export function fileKind(item: { isDir: boolean; name: string }): FileKind {
  if (item.isDir) return 'folder'
  return BY_EXT.get(extOf(item.name)) ?? 'other'
}

export function kindMeta(kind: FileKind): KindMeta {
  return META[kind]
}

/** List-view "Kind" column: the kind label, or the extension for unknown types ("DMG file"). */
export function kindLabel(item: { isDir: boolean; name: string }): string {
  const kind = fileKind(item)
  if (kind === 'other') {
    const ext = extOf(item.name)
    return ext ? `${ext.toUpperCase()} file` : 'File'
  }
  return META[kind].label
}

/** The server makes thumbnails for these (images via sharp, PDFs via pdftoppm when installed). */
export function hasThumb(item: { isDir: boolean; name: string }): boolean {
  const k = fileKind(item)
  return k === 'image' || k === 'pdf'
}

/** Originals the browser can draw itself (HEIC/TIFF stay on the server's preview). */
export function browserCanShowImage(name: string): boolean {
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp'].includes(extOf(name))
}

/** Text files up to this size open inline in the viewer. */
export const TEXT_PREVIEW_MAX = 256 * 1024

export function isTextPreviewable(item: { isDir: boolean; name: string; size: number }): boolean {
  const k = fileKind(item)
  return (k === 'text' || k === 'csv') && item.size <= TEXT_PREVIEW_MAX
}

/** "untitled folder", then "untitled folder 2", "untitled folder 3"… (case-insensitive, like the NAS). */
export function nextUntitledName(existing: Iterable<string>, base = 'untitled folder'): string {
  const taken = new Set(Array.from(existing, n => n.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

/** "Keep both": `scan.pdf` → `scan 2.pdf`, or the next free number (Finder's convention). */
export function keepBothName(name: string, taken: Iterable<string>): string {
  const set = new Set(Array.from(taken, n => n.toLowerCase()))
  const { stem, ext } = splitName(name)
  for (let i = 2; i < 10000; i++) {
    const candidate = `${stem} ${i}${ext}`
    if (!set.has(candidate.toLowerCase())) return candidate
  }
  return `${stem} ${Date.now()}${ext}`
}

/**
 * Shortens a long name in the middle so the end of the stem and the extension stay
 * visible: "Quarterly statement for the account ending 4411.pdf" →
 * "Quarterly statement for the acc…ding 4411.pdf". Names within `max` are returned as is.
 */
export function middleEllipsis(name: string, max: number): string {
  const chars = [...name]
  if (chars.length <= max) return name
  const { ext } = splitName(name)
  const tail = Math.min(chars.length - 1, [...ext].length + 6)
  const head = Math.max(1, max - tail - 1)
  return `${chars.slice(0, head).join('')}…${chars.slice(chars.length - tail).join('')}`
}

const HIDDEN_NAMES = new Set(['#recycle', '#snapshot', '@eadir'])

/**
 * Why a name can't be used, or null. The server hides dot-entries, Synology housekeeping
 * folders and `*.part` upload temp files from listings without refusing them, so an item
 * renamed to one would silently vanish — the inputs refuse them instead.
 */
export function nameProblem(name: string): string | null {
  const n = name.trim()
  if (!n) return 'Enter a name'
  if (n === '.' || n === '..' || /[/\\\0]/.test(n)) return 'Names can’t contain / or \\'
  if (n.startsWith('.')) return 'Names starting with a dot are hidden on the NAS'
  if (n.toLowerCase().endsWith('.part')) return '“.part” files are hidden (upload temp files)'
  if (HIDDEN_NAMES.has(n.toLowerCase())) return 'That name is reserved by the NAS'
  if (new TextEncoder().encode(n).length > 255) return 'That name is too long'
  return null
}
