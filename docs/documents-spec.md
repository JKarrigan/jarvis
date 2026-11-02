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
- **Names are Unicode.** Upload file names are decoded as UTF-8 (busboy
  `defParamCharset: 'utf8'`; without it "—" arrived as "â€”"). New names (upload,
  mkdir, rename) are stored NFC. Files made on a Mac over SMB may be NFD on the share,
  so `resolveSafe` matches any path segment that doesn't exist as given against the
  directory's entries by NFC form and continues with the on-disk spelling; a name that
  exists in the other normalisation counts as taken (409) for upload, rename and move;
  search compares NFC, lower-cased. Downloads send an ASCII `filename` plus RFC 5987
  `filename*` (`contentDisposition` in `lib/http.ts`, which also escapes `' ( ) * !`).

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
  Date modified, Size + direction), grid/list toggle and a **Select** button. The
  current folder is `?folder=<relPath>`; folder moves and the viewer's `?view=`
  both go through the History API (`pushState`, which Next syncs into
  `useSearchParams`), never `router.push`, so Back steps up a folder and Next's
  router state can't drift from the address bar (a drifted state silently dropped
  crumb clicks and the rail link). The page is `force-dynamic`: prerendered as
  static, Next reused the first load's URL (search params included) when a Link
  targeted the route again. A rail or tab link to the section you're already in
  resets it to the top level. View mode and sort are remembered per browser
  (localStorage). Names sort with a numeric, accent- and case-insensitive collator;
  tile names are middle-truncated by grapheme (`Intl.Segmenter`), so emoji and
  combining marks are never split.
- **Folder navigation** (instant, no layout shift).
  - *Listing cache* (`folderCache.ts`, unit-tested): an in-memory, per-tab cache of
    listings (items + disk) keyed by path. `useFolder` reads it first, so a cached folder
    shows in the same frame, and revalidates it in the background when older than 2 s
    (an unchanged answer keeps the same objects and re-renders nothing; an older answer
    never replaces a newer one). Uploads patch cached folders (`addLocal`, optimistic
    entries survive refetches that started before them); rename patches the parent and
    drops the folder's own entries; move/delete remove the items and drop their subtrees;
    folders whose item counts changed go stale (refetched on the next visit or prefetch).
  - *Prefetch*: hovering (mouse) or pressing a folder tile/row or a crumb (or focusing a
    crumb, or the keyboard lead landing on a folder) fetches it; once a folder is on screen
    its parent and, when idle, up to 8 visible subfolders are fetched. At most 2 prefetches
    run at once; queued idle ones are dropped when you move on.
  - *Uncached folder*: the previous folder stays on screen with a thin indeterminate bar
    on top of the card (faded in after 120 ms; `aria-busy` on the list) and the header
    summary faded out; the new folder swaps in when it arrives. Only after 400 ms with
    nothing does the skeleton replace it, in the real tiles'/rows' geometry and holding the
    card's height. The first load shows the skeleton straight away.
  - *Transition*: each swap fades in over ~170 ms with a 10 px slide — from the right going
    into a folder, from the left going up (Back counts as up when the target is an
    ancestor); siblings and search fade only. Reduced motion: fade only. None on first load.
  - *Stable geometry*: tiles have a fixed well, a fixed two-line name block and a fixed
    meta line (size / item count / folder path / upload progress); list rows are one fixed
    height; the summary line and the crumb bar are fixed-height single lines; thumbnails
    fade in over the typed icon, which keeps its box (shared classes in `geometry.ts`).
  - *Scroll and focus*: scroll restoration is manual on this page; each folder's position
    is remembered per tab as you scroll. Going into a folder brings the list's top into
    view only if it is above the viewport; going up, Back/Forward restore where you were
    in that folder. A navigation started from the keyboard (Enter, ⌘↑, Enter on a crumb)
    puts the focus on the new folder's first item; otherwise focus stays where it was.
- **Grid.** Folder icon or typed file icon (PDF, Word, Excel, PowerPoint, CSV,
  text, image, audio, video, archive, other — colour-coded like GuardianPad),
  image and PDF thumbnails when the server has them, name underneath (2 lines,
  middle-ellipsis keeps the extension). Phones: 3 columns.
- **List.** Columns Name (icon + name), Kind, Modified, Size; clicking a header
  sorts, again reverses. Phones: Name + a secondary line, no columns.
- **Click opens.** A plain click or tap on a tile or row opens it (folder → in,
  file → viewer); it never selects. Outside selection mode the second click of a
  double-click is ignored, so a Finder habit can't open the folder that slides in
  under the pointer. Keyboard: arrows move the focus ring without selecting,
  Enter opens the focused item, F2 renames it, Delete asks to delete it.
- **Selection is explicit** (`selectionReducer` in `selection.ts`, unit-tested).
  Selection mode is entered from the ⋯ / right-click menu's **Select** (with that
  item selected), the toolbar's **Select** (nothing selected yet), or the desktop
  power shortcuts: Space on the focused item, Cmd/Ctrl-click (toggle),
  Shift-click (range from the last clicked item), Shift+arrows, Cmd/Ctrl+A. In
  selection mode every tile/row shows a circle, a plain click/tap toggles,
  Shift-click adds a range, and folders select like files. The selection bar
  shows "N selected" with Select all, Move to…, Download (one file), Delete and
  Done; Done, Escape (from anywhere on the page) and a finished Move/Delete leave
  selection mode.
- **Open.** Viewer: PDFs in the pdf.js reader (below), images, video and audio
  natively from `content`, text up to 256 KiB inline; anything else (Word,
  Excel, …) shows a big icon card with Download and "Open on NAS" path.
  Shift+←/→ and the header ‹ › buttons step through the current folder's files;
  for files other than PDFs plain ←/→ do too (in a PDF they turn pages).
- **PDF reader** (`PdfView.tsx` + `pdf/*`): pdf.js's own viewer component
  (`pdfjs-dist/legacy/web/pdf_viewer.mjs`: PDFViewer, EventBus, PDFLinkService,
  PDFFindController), loaded on demand by `loadPdfViewer()` in `books/pdf.ts`
  (which sets `globalThis.pdfjsLib` from the legacy core first). The PDF streams
  by range from `/api/files/content` (`disableAutoFetch`/`disableStream`); the
  worker, cmaps, fonts, `pdf_viewer.css` and its images come from `/api/pdfjs`.
  The stylesheet is attached as a `<link>` only while a reader is open
  (refcounted, removed on close), so its global rules never reach the rest of
  the app; Reel overrides are scoped under `.reel-pdf`.
  - Continuous scroll on a neutral grey canvas, pages rendered lazily at
    device-pixel-ratio sharpness; selectable/copyable text layer; links (internal
    ones jump, external ones open a new tab).
  - Find: Cmd/Ctrl+F or the search button; case-insensitive, highlights all,
    "3 of 17", Enter / Shift+Enter (or ↑/↓) for next/previous.
  - Zoom: − / + (25–400 %), a menu with Fit width, Fit page and 50–400 %,
    Ctrl/Cmd+wheel, trackpad and touch pinch, Cmd/Ctrl + `=` / `−` / `0`.
  - "Page [n] of N" with an editable number; ←/→, PgUp/PgDn, Home/End when not
    typing. Escape closes find first, then the viewer.
  - Desktop sidebar (toggle): lazily drawn thumbnails, current page
    highlighted, click to jump; an Outline tab when the PDF has bookmarks.
  - Rotate, print (hidden iframe; touch devices open the PDF in a new tab),
    download.
  - Remembers page, zoom and rotation per document version (localStorage
    `reel.documents.pdf.v1`, keyed by path + modified, newest 200 kept). Default
    zoom: Fit width on phones; on desktop Fit page or 100 %, whichever is smaller.
  - Phones: a compact bottom bar (page ↑/↓, page number, zoom %, find) with
    Find, zoom, Fit width/page, Rotate, Print and Download in a ⋯ menu.
- **Rename.** F2 on the focused item or the menu's Rename: inline input, stem
  selected, extension kept; Enter commits, Escape cancels; 409 shows "A file
  with that name already exists" inline.
- **New Folder** creates "untitled folder" (auto-suffixed " 2", " 3") and opens
  it in rename mode.
- **Drag and drop** (native HTML5, no new dependency): drag an item onto a folder
  tile/row or a breadcrumb to move it — no selection needed; in selection mode a
  selected item drags the whole selection, with a count badge. A drag whose tile
  unmounts mid-drag is ended from the window's `dragend`/`drop`, so nothing stays
  dimmed. Drop files **or folders** from the desktop anywhere on the browser to
  upload into the current folder, or onto a folder to upload into it. Folder
  drops are walked with `DataTransferItem.webkitGetAsEntry()` (paged
  `readEntries`) and recreated under the drop target: folders (empty ones too)
  are made parents-first, then each file goes into its subfolder; `.DS_Store`
  and other names the server hides are skipped (`walkEntries` / `planUploads` in
  `uploadPlan.ts`, unit-tested). Drop highlight + "Drop to add to {folder}"
  pill. Touch devices use Move to….
- **Move to…** dialog: folder tree picker with New folder inside it.
- **Context menu**: right-click and the ⋯ button share one action list (Select,
  Open, Download, Rename, Move to…, Delete); on a selected item in selection mode
  with several selected, Move / Delete apply to all of them.
- **Uploads** (`useUploads.ts`). One XHR per file, three at a time, files in name
  order within each folder (button uploads are files only).
  - *In place.* Each queued / uploading / failed file appears at once as a
    placeholder tile/row in its target folder (when open) — type icon, name and
    Queued / % / Failed + Retry — sorted with the real items by the current sort
    (`withPlaceholders`). When a file is stored the listing is patched from the
    upload result (`useFolder().addLocal`), so the placeholder becomes the real
    entry in the same spot, in the same render.
  - *Stable listing.* `useFolder` is stale-while-revalidate over the listing cache:
    refreshing a loaded folder keeps its items until the new listing replaces them (a
    failed background refresh keeps them too, unless the folder is gone or storage went
    offline). Optimistic entries survive a refetch that started before they were stored
    (`mergeListing`).
    Server refreshes are coalesced: at most one every 2 s while a queue runs,
    plus one when it drains, so the final state matches the server.
  - *Panel.* Floating bottom-right: a stable summary ("Uploading 12 of 30 ·
    4.2 MB of 18 MB") with an overall bar and Cancel all, a collapsible list
    (grouped by folder for folder drops), per-file errors with Retry, Keep both /
    Skip on name clashes and, when several clash, "Keep both for all" / "Skip
    all". The page stays usable; `beforeunload` warning while uploading.
  - *Why it flashed before.* Every stored file called `reload()`, which aborted
    the listing in flight; `request()` in `api.ts` swallowed the AbortError
    thrown while reading the JSON body and returned `{}`, so the aborted request
    resolved as an *empty folder* and was committed to state ("This folder is
    empty" between batches). Aborts now stay aborts and `useFolder` ignores
    answers to aborted requests.
- **Delete.** One confirm per action; for folders it states what is inside
  (from `stat`). Synology's recycle bin ignores NFS deletes, so when the share
  has a `#recycle` folder (recycle bin enabled in DSM) the server moves deleted
  items to `#recycle/<their folder>/` itself (never overwriting earlier copies);
  they show in File Station's Recycle Bin and follow DSM's retention. Without a
  recycle bin, deletes are permanent and the confirm says so
  (`/api/files/status` reports `recycle`).
- **Offline.** "Documents storage is offline (the NAS share isn't mounted)"
  banner; uploads and edits disabled.
- Reel look and tokens throughout; accessible dialogs, menus and keyboard
  navigation (arrows move focus in grid/list, Enter opens, Delete asks).

## Out of scope (for now)

Tags on documents, folder download as zip, sharing links, Office previews
(would need LibreOffice on the Pi), full-text search inside PDFs.
