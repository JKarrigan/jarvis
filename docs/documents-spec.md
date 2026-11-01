# Documents — family file storage

The Documents section is the home app's general file store: PDFs, Word and Excel
files, scans, receipts, anything that is not a photo or a video for the Photos
library. It replaces the old Air-side Files browser (`/files`) with a
Finder-style browser modelled on GuardianPad's client Documents tab
(`guardianpad/docs/tasks/documents-01-finder-browser.md`), restyled for the Reel
media shell and backed by real folders on the NAS.

## Storage

- The documents root is `FILES_ROOT`. On the Pi it is a dedicated NAS share,
  `documents`, NFS-mounted at `/mnt/nas/documents` exactly like the `photo`
  share (see `pi-deploy.md`). Folders are real directories on the share, so the
  same tree is what you see in Finder over SMB, in backups, and after a Pi
  rebuild. The Pi keeps only a disposable thumbnail cache.
- **Mount guard.** With `NAS_REQUIRE_MOUNT=1` (set on the Pi) a root that is not
  a mount point (same device as its parent directory) is treated as offline:
  listing returns 503 `{ error: 'Storage offline', offline: true }` and every
  write is refused, so nothing is ever written to the SD card under an empty
  mount point. The same check applies to `PHOTOS_ROOT` for photo uploads.
  Unset in development.
- Hidden from listings and search: dot-entries, `#recycle`, `#snapshot`,
  `@eaDir` (Synology housekeeping), and `*.part` upload temp files.
- Uploads never overwrite (409 + "Keep both" in the UI), as today.

## API (existing `/api/files/*`, extended)

Unchanged contracts the browser relies on: `GET list?path=` →
`{ entries: ApiEntry[], disk }` (`ApiEntry` in `lib/fileTypes.ts`; folders carry
`childCount`), `GET search?q=&path=&limit=` → `{ results: SearchResult[], truncated }`,
`GET content?path=` (Range, `download=1`), `POST upload?path=` (multipart; 409
`{ error, conflicts, saved }`, 413), `POST mkdir?path=`, `POST rename?path=&name=`,
`POST move?from=&to=`, `DELETE delete?path=[&recursive=0]`. Every mutating route
calls `assertSameOrigin`; errors are `{ error }`.

New:

| Route | Purpose |
|---|---|
| `GET /api/files/thumb?path=&size=t\|p` | WebP thumbnail (`t` 320 px, `p` 1280 px) for images (sharp; HEIC via the Photos tile-grid decoder) and PDFs (first page via `pdftoppm` from poppler-utils when installed, else 404 so the UI shows the typed icon). Cached on local disk under `FILES_CACHE` (default `.files-cache` in cwd) keyed by path + size + mtime; `Cache-Control: private, max-age=86400`. |
| `GET /api/files/stat?path=` | Recursive `{ files, folders, bytes, truncated }` for a folder (bounded walk, 20k entries) — used by the delete confirm ("contains 12 files in 3 folders"). |
| `GET /api/files/status` | `{ online, root: 'documents', disk }` — drives the offline banner. |

Removed: `/api/files/video`, `/api/files/audio` and `_lib/transcode.ts` (only the
old browser's MSE player used them; documents play natively through `content`
with Range, and Photos has its own `/stream`).

## UI (`app/media/documents/**`, `app/_components/media/documents/**`)

- **Placement.** A Documents entry in the media rail after Photos (folder icon).
  The mobile tab bar becomes Home · Photos · Documents · Books · Search · Settings
  (the Movie Picker stays on the desktop rail and the Home page). `/files`
  redirects to `/media/documents`; the Air sidebar's Files link points there.
- **Header.** Title "Documents", a summary line (`N files · M folders · size` of
  the current folder), New Folder and Upload buttons.
- **Toolbar.** Breadcrumbs (Documents › Taxes › 2025, each a drop target),
  search (all folders; results show each hit's folder path), sort (Name, Kind,
  Date modified, Size + direction), grid/list toggle. The current folder is
  `?folder=<relPath>` and navigation uses `router.push`, so Back steps up a
  folder. View mode and sort are remembered per browser (localStorage).
- **Grid.** Folder icon or typed file icon (PDF, Word, Excel, PowerPoint, CSV,
  text, image, audio, video, archive, other — colour-coded like GuardianPad),
  image and PDF thumbnails when the server has them, name underneath (2 lines,
  middle-ellipsis keeps the extension). Phones: 3 columns.
- **List.** Columns Name (icon + name), Kind, Modified, Size; clicking a header
  sorts, again reverses. Phones: Name + a secondary line, no columns.
- **Selection.** Click selects, Cmd/Ctrl-click toggles, Shift-click ranges,
  Cmd/Ctrl+A, Escape clears; a selection circle on each tile/row (as in Photos)
  for touch. A selection bar shows the count with Move to…, Download (single
  file) and Delete.
- **Open.** Double-click (single tap on touch, or Enter) opens a folder or the
  file viewer. Viewer: PDFs in a pdf.js reader (reuse `books/pdf.ts` loading
  via `/api/pdfjs`), images, video and audio natively from `content`, text up to
  256 KiB inline; anything else (Word, Excel, …) shows a big icon card with
  Download and "Open on NAS" path. Left/right pages through the current
  folder's files only.
- **Rename.** F2, Enter on a single selection, the menu's Rename, or clicking the
  name of the selected item: inline input, stem selected, extension kept;
  Enter commits, Escape cancels; 409 shows "A file with that name already
  exists" inline.
- **New Folder** creates "untitled folder" (auto-suffixed " 2", " 3") and opens
  it in rename mode.
- **Drag and drop** (native HTML5, no new dependency): drag items onto a folder
  tile/row or a breadcrumb to move (a selected item drags the whole selection,
  with a count badge); drop files from the desktop anywhere on the browser to
  upload into the current folder, or onto a folder to upload into it. Drop
  highlight + "Drop to add to {folder}" pill. Touch devices use Move to….
- **Move to…** dialog: folder tree picker with New folder inside it.
- **Context menu**: right-click and the ⋯ button share one action list (Open,
  Download, Rename, Move to…, Delete).
- **Uploads.** Floating queue bottom-right with per-file progress, Keep both /
  Skip on conflicts, errors stay with Retry, Cancel all; the page stays usable;
  `beforeunload` warning while uploading.
- **Delete.** One confirm per action; for folders it states what is inside
  (from `stat`). Deletion is permanent on the NAS but Synology's `#recycle`
  keeps a copy when the share's recycle bin is enabled — the confirm says so.
- **Offline.** "Documents storage is offline (the NAS share isn't mounted)"
  banner; uploads and edits disabled.
- Reel look and tokens throughout; accessible dialogs, menus and keyboard
  navigation (arrows move focus in grid/list, Enter opens, Delete asks).

## Out of scope (for now)

Tags on documents, folder download as zip, sharing links, Office previews
(would need LibreOffice on the Pi), full-text search inside PDFs.
