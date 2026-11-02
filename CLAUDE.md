# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # start dev server (http://localhost:3000)
npm run build    # production build
npm run lint     # ESLint
npm run typecheck # tsc --noEmit
npm test         # Vitest (tests/**/*.test.ts, lib/**/*.test.ts; `server-only` is aliased in vitest.config.ts)
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build on Node 22 (`engines` ≥ 20.9, `.nvmrc` 22; better-sqlite3 and sharp are native modules, so the Node version on the Pi matters).

## Architecture

This is a Next.js 16 App Router app for the home: **Air** (`app/(air)/**`: air quality, Hue lights, system) and **Media / "Reel"** (`app/media/**`: Jellyfin movies, TV, audiobooks, books, the family **Photos** library and **Documents**). It runs on a Raspberry Pi; everything irreplaceable lives on the Synology NAS (Jellyfin libraries, the photo and documents shares), the Pi only indexes, serves and caches.

### App shell

The root layout owns metadata (title template `%s · Home`), the `viewport` export, the PWA bits (`app/manifest.ts`, `app/icon.png`, `app/apple-icon.png`, `public/icons/`) and `<MotionConfig reducedMotion="user">`; reduced motion for CSS animations is handled in `globals.css`. `app/global-error.tsx`, `app/(air)/error.tsx` and `app/media/{error,loading,not-found}.tsx` are the boundaries. `AppSwitcher` (top-left) is the only bridge between the two apps. Shared accessible dialog primitives (`Modal`, `Drawer`, `Sheet`: role=dialog, focus trap, Escape handled by the top-most dialog only, which calls `preventDefault` — window-level Escape listeners must check `e.defaultPrevented`) live in `app/_components/lights/dialog.tsx` and are re-exported from `HueControls.tsx`. `lib/http.ts` has the request helpers every API route uses: `assertSameOrigin` (called first in every mutating handler — the app has no auth, this is the CSRF/DNS-rebinding defence; never put it in `proxy.ts`), `intParam`/`numParam`, `isLanHost`, `parseRange`, `readJson`.

### Data flow

1. **Startup** — `instrumentation.ts` (Node.js runtime only) calls `startBackgroundJobs()` in `lib/startup.ts`, which starts the poller from the saved device host (`settings` key `ag.deviceHost`, saved by `POST /api/device`, else `DEVICE_HOST`), prunes hourly (readings 30 d, closed events 90 d) and starts the photo scanner. Nothing waits for a browser any more.
2. **Server poller** (`lib/poller.ts`) — a `globalThis` singleton (hot-reload safe) running a `setTimeout` chain with an in-flight guard, fetching `/measures/current` every 10 s, validating the payload (`insertReading` rejects junk) and writing rows via `lib/db.ts`. **Event detection runs here**, server-side: `lib/eventDetection.ts` is one incremental `EventDetector` (1-minute wall-clock grid, id `${type}_${startMs}` created once at onset, baseline frozen at onset, closes after 5 clear minutes, per-gap warm-up); batch reprocess replays readings through the same detector in one transaction and keeps acknowledgements. Clients only read `/api/events`.
3. **SQLite** (`lib/db.ts`) — `globalThis` singleton (`better-sqlite3`; external by default in Next, no config needed). Tables: `readings(id, timestamp, data TEXT)` (JSON `DeviceMeasures`), `settings(key, value)`, `events`, plus the photo tables. `getHistory` returns raw rows for spans ≤ 6 h and SQL-averaged buckets (≤ ~800 points, cached per bucket) above that, so 30 days is 800 points instead of 259k rows.
4. **API routes** (`app/api/`) — thin wrappers around `lib/*`. No auth (LAN only) but every mutating route calls `assertSameOrigin`, every numeric input goes through `intParam`/`numParam`, and errors are generic (`{ error }`, real status codes; details only in the server log).
5. **PollingProvider** (`app/_components/PollingProvider.tsx`, mounted in `app/(air)/layout.tsx` so media pages don't poll) — client context polling `/api/latest` every 10 s (setTimeout chain, paused while the tab is hidden, fills gaps after one) and `/api/events` every 30 s; reads its localStorage settings through `useSyncExternalStore` (cross-tab). The server is the source of truth for the device host. `lib/useNow.ts` + `Clock.tsx` keep the per-second clock out of the dashboard render; `StaleBanner.tsx` greys values when data is > 60 s old.
6. **Dashboard** — `DashboardShell` reads from `PollingProvider` and passes props down to `Dashboard`, which renders the AQI hero, 8 metric cards (memoized), and history charts (time-based x-axis, lines break at gaps).

### Key lib files

| File | Purpose |
|---|---|
| `lib/types.ts` | `DeviceMeasures`, `HistoryEntry`, `ComputedAqi`, `StatusColor` |
| `lib/aqi.ts` | `computeAqi(pm25)` → EPA AQI (2024 table); `aqiToColor(aqi)` → `StatusColor` |
| `lib/thresholds.ts` | Per-metric `StatusColor` functions (`co2Status`, `pm25Status`, …) |
| `lib/statusColors.ts` | The single `StatusColor` → hex / Tailwind class / label map (don't copy colours into components) |
| `lib/http.ts` | Request helpers for API routes (same-origin check, param parsing, Range, LAN host validation) |
| `lib/files.ts` | Documents storage: root-safe path resolution (`resolveSafe`, `resolveEntry` refuses the root; realpath checks), hidden-entry filter, mount guard (`storageOnline`), `folderStats`, thumbnail cache keys |
| `lib/mount.ts` | `isMountPoint` / `NAS_REQUIRE_MOUNT` check shared by Documents and Photos |
| `lib/pmCalibration.ts` | Batch-specific PMS5003 correction factors (client-side only) |

### Env vars

| Variable | Where used |
|---|---|
| `DEVICE_HOST` / `NEXT_PUBLIC_DEVICE_HOST` | Fallback AirGradient host when none is saved in `settings` (`POST /api/device` saves it); must pass `isLanHost` |
| `DB_PATH` | Override SQLite file location (default: `airgradient.db` in cwd) |
| `OUTDOOR_LAT` / `OUTDOOR_LON` | Server-side fallback coordinates for `/api/outdoor-aqi` |
| `FILES_ROOT` | Root of the Documents section, the NAS `documents` share (on the Pi `/mnt/nas/documents`; default `/mnt/storage`) — `lib/files.ts` |
| `NAS_REQUIRE_MOUNT` | `1` on the Pi: `FILES_ROOT` and `PHOTOS_ROOT` must be mount points, else they are offline (503, writes refused) — `lib/mount.ts` |
| `FILES_CACHE` | Local cache for document thumbnails (default: `.files-cache` in cwd; disposable) |
| `PDFTOPPM_PATH` | `pdftoppm` (poppler-utils) for PDF thumbnails (default: on `PATH`; missing → no PDF previews) |
| `FFMPEG_PATH` / `FFPROBE_PATH` | ffmpeg/ffprobe binaries for Photos, HEIC thumbnails and audiobook chapters (default: on `PATH`; ≥ 7.1 for HEIC) |
| `MAX_UPLOAD_BYTES` | Per-file upload limit for `/api/files/upload` (default 8 GiB) |
| `HUE_SSE_IDLE_MS` | Idle watchdog for the bridge event stream (default 60000) — `lib/hueSse.ts` |
| `DEV_ORIGINS` | Comma-separated `allowedDevOrigins` for `next dev` on the LAN |
| `JELLYFIN_URL` | Jellyfin server base URL, e.g. `http://NAS_IP:8096` — `lib/jellyfinServer.ts` |
| `JELLYFIN_USER` / `JELLYFIN_PASSWORD` | Dashboard user the frontend authenticates as (token cached server-side) |
| `PHOTOS_ROOT` | Photo library (on the Pi: a mounted NAS share, e.g. `/mnt/nas/photo`; default `$FILES_ROOT/Photos`) — `lib/photos/config.ts` |
| `PHOTOS_CACHE` | Local cache for derived thumbnails/previews/posters (default: `.photos-cache` in cwd; disposable) |
| `JELLYFIN_API_KEY` | Alternative to user/password (admin-wide; server-side only). Optional `JELLYFIN_USER_ID` selects the user for user-scoped calls |

All variables are documented in `.env.example`. When no `JELLYFIN_URL` is set in development, `lib/jellyfinServer.ts` serves mock data so the media UI still renders (`MEDIA_MOCK=1` forces it).

### Search by person

The global Search modal (`SearchModal.tsx`) fetches a compact index from `GET /api/media/search-index` when it opens (cached client-side for 60 s): titles, collections, audiobooks, ebooks and **people**. Credits (every director plus the top 8 billed actors per movie/show, `ReelCredit`) are **not** part of the catalog query: asking Jellyfin for `People` on the whole library takes ~6 s and pushes the response past Next's 2 MB cache cap, so they come from a separate paged `Fields=People` fetch memoized on `globalThis` (`getCreditsIndex`, 5 min TTL, stale-while-revalidate; on failure the catalog still renders without credits). `getCatalog()` merges them onto each `ReelTitle.people` **without** headshot URLs (the catalog is passed to library pages); the search-index route reads `getTitleCredits()` (with headshots) and aggregates people as `{ id, name, imageUrl, directed, acted }`, where `directed`/`acted` are indexes into `titles`. Search results list matching people first (avatar or initials, linking to `/media/person/[id]`) and, after the titles whose own name matches, the titles they're credited on ("Directed by …" / "With …").

The same credits drive the library filter bar (`library.tsx`): type (on mixed views), genre, tag, searchable Director / Actor dropdowns (`allPeople` in `selectors.ts`), a free-text filter over titles and names, Show and Sort, plus Reset. Someone who both directs and stars in a title holds one credit of each kind.

### Audiobooks

Audiobooks are a separate model from movies/TV (`Audiobook*` types, not `ReelTitle`) — `lib/jellyfinAudiobooks.ts` reads Jellyfin `AudioBook` items (a **Books** library, one M4B per book). Jellyfin 10.11 does not return chapter markers for audiobooks, so they are read with `ffprobe` over the Direct Play stream and cached in the SQLite `settings` table (`audiobook.chapters.<id>.<size>`); Jellyfin's own `Chapters` win if a future release provides them. Playback is *not* `JellyfinPlayer`: `app/_components/media/audiobooks/AudiobookPlayer.tsx` is a provider mounted in `MediaShell` (outside `PageTransition`) that owns a single `<audio>` element so a book keeps playing across navigation; `PlayerChrome.tsx` renders the docked mini player and the full now-playing sheet. Resume position lives in Jellyfin (progress reported through `/api/jellyfin/report`); only the loaded book id, speed and volume are in `localStorage` (`reel.audiobook.v1`).

### Books (reading)

The Books rail entry has two halves: **Listen** (`/media/audiobooks`, above) and **Read** (`/media/books`). Readable books are Jellyfin `Book` items (PDFs in a second Books library, laid out `Author/Title/Title.pdf`) — `lib/jellyfinBooks.ts`. Jellyfin only indexes them, so: the author falls back to the grandparent folder name, a `Level N` tag becomes the graded-reader level filter, covers are rendered from page 1 **in the browser** and posted to `/api/jellyfin/books/[id]/cover`, which stores them as the item's Primary image, and the reading position lives in the SQLite `settings` table (`book.progress.<id>`), not Jellyfin. The reader (`app/_components/media/books/BookReader.tsx`) uses `pdfjs-dist` (legacy build); its worker, CJK cmaps, fonts and wasm (plus the Documents reader's `pdf_viewer.css` and its images) are served from `node_modules` by `app/api/pdfjs/[...path]` and the PDF itself is range-proxied through `/api/jellyfin/books/[id]/file`.

**Read-along narration:** Jellyfin resolves a `Title/` folder to the Book and ignores an MP3 placed beside the PDF, so a book's narration lives in the *Audiobooks* library at the same `Author/Title/Title.mp3` path. `folderKey()` in `lib/jellyfinBooks.ts` pairs them (`Ebook.audioId`); the reader plays it through the persistent audiobook player (play / back 5 s / 1×·0.8×·0.6×, speed remembered per book), and `getAudiobooks()` leaves paired narrations off the Listen shelf, Home and search.

**Narration timings (karaoke-style read-along):** `scripts/sync-narration.py BOOK.pdf NARRATION.mp3 OUT.json --upload http://HOST:3000 --book <jellyfin book id>` runs **offline on a fast machine, never on the Pi**: faster-whisper (word timestamps, the book's vocabulary passed as `hotwords` so it spells like the book; windows kept independent because carrying context makes it loop), lines re-cut at real pauses, then each line placed on a page by comparing *hiragana readings* (pykakasi) with a length-weighted monotonic DP. Page text comes from the PDF text layer, else macOS Vision (`scripts/ocr-pdf.swift`, horizontal only), else Tesseract `jpn_vert` for vertical Japanese. Below 0.70 confidence every line gets `page: 0` (captions only, no auto page turns). Spelling: the title/author (`--names`) and the book's most frequent kanji/katakana words go to Whisper as hint words; afterwards any transcript word that *reads* the same as a name or recurring book word but is spelled differently is corrected automatically (猫股→猫又), and `--fix wrong=right` covers what can't be derived (ズレズレ草→徒然草). For pages without a text layer the Tesseract run also yields character positions (`pageChars`, page fractions): Tesseract's per-character boxes are broken for vertical text, so word boxes are split evenly along the reading direction and words are kept by thickness relative to a Japanese-weighted median (drops furigana and illustration junk). Timings are stored in the `settings` table (`book.sync.<id>`) via `/api/jellyfin/books/[id]/sync`. In the reader, `ReadAlong.tsx` draws a multiply-blended highlighter over the printed words (from the PDF text layer, or the timings' OCR'd `pageChars` when the layer holds almost no Japanese — a bare page number counts as none; `pageChars()` in `pdf.ts` skips furigana by type size, and an LCS aligns transcript to page), shows a caption strip or a large-type side panel, and turns pages 0.6 s ahead of each line.

### Photos

Family photos/videos (`docs/photos-spec.md`) are plain files under `PHOTOS_ROOT` — a NAS share the Pi only mounts — indexed into the `photos` / `albums` / `album_items` tables of the same SQLite db (`lib/photos/db.ts`; `getDb()` from `lib/db.ts`). `lib/photos/scan.ts` is a `globalThis` single-flight scanner (started from `lib/startup.ts`, then every 6 h, after uploads, and on `POST /api/photos/scan`): it walks the share (skipping dot-entries, `@eaDir`, `#recycle`), only re-reads files whose size/mtime changed, re-links moved files by a cheap hash (sha1 of size + first 1 MiB + last 64 KiB), and marks vanished files `.missing/…`. **Mount guard:** the first scan of a non-empty library writes `PHOTOS_ROOT/.photos-library`; if that marker is gone (or the root is unreadable) while the index has rows, scans abort with `libraryOnline: false` instead of treating everything as deleted. Favorites, albums and tags are mirrored, keyed by `rel_path`, to `PHOTOS_ROOT/.library/catalog.json` (debounced 5 s, `lib/photos/catalog.ts`) and imported when those tables are empty (fresh Pi). **Tags** are free-form (`photo_tags`, keyed by photo id so they follow trash/restore/moves): stored as typed but matched through a lower-cased `tag_key` (normalisation in client-safe `lib/photos/tags.ts`, unit-tested), edited per item via `PATCH /api/photos/[id] { tags }` and in bulk via `POST /api/photos/tags`, and filtered with `GET /api/photos?tag=` (the timeline keeps it in `?tag=`). Metadata: sharp + `exif-reader` (HEIC containers too), ffprobe for videos (`lib/photos/meta.ts`). Thumbnails (`t` 400 px, `p` 1600 px, video `poster`) are made lazily into `PHOTOS_CACHE/<id>/` by `lib/photos/thumbs.ts` through a 2-slot priority queue (requests before background fill); HEIC is decoded with ffmpeg: iPhone files are a grid of 512 px HEVC tiles plus auxiliary images (depth map, portrait matte), and ffmpeg 7.x picks one tile or the matte on its own, so `heifFrame()` reads the grid geometry with `ffprobe -show_stream_groups` and stitches it (concat → tile → crop), then applies the EXIF orientation sharp reads from the container. Upload also writes the mount-guard marker, and a missing marker self-heals when indexed files are present on disk. Uploads/trash/restore live in `lib/photos/store.ts` (uploads go to `YYYY/MM/` by capture date, trash is `PHOTOS_ROOT/.trash/<original path>`). Routes are under `app/api/photos/**`; `/[id]/stream` is a capped (2) live H.264 720p transcode killed on disconnect. Thumb URLs are `immutable`, so the UI appends `&v=` when an item changes; a decode failure leaves a `failed` marker in the item's cache folder until the file's mtime changes.

**Photos UI** (`app/media/photos/**`, components in `app/_components/media/photos/**`): the timeline (month sections, keyset infinite scroll, filter chips, year/month jump list, select mode with long-press / shift-click), the lightbox `PhotoViewer` (opened with `?v=<id>` through the History API so Back closes it — passing `history.state` back to `pushState` silently skips Next's `useSearchParams` sync, always pass a fresh object; images show the `p` preview and load the original only on zoom; videos fall back from `/file` to `/stream?t=` when `canPlayType` rejects the codec), the batch `Uploader` (XHR per 10 files, cancel, `beforeunload`), albums, Recently deleted, and `MemoriesRow` on the media Home ("on this day" from earlier years, else the newest). A "Library offline" banner appears whenever the mount guard reports the share missing.

### Documents

The family file store (`docs/documents-spec.md`): a Finder-style browser at `/media/documents` (the old `/files` redirects there) over real folders on the NAS `documents` share, mounted at `FILES_ROOT`. The API is `app/api/files/**` on top of `lib/files.ts`: `list`, `search`, `content` (Range), `upload` (never overwrites, 409), `mkdir`, `rename`, `move`, `delete`, plus `thumb` (WebP `t` 320 / `p` 1280 px: sharp for images, the Photos HEIC decoder `decodeHeifFrame`, PDFs page 1 via `pdftoppm`; cached in `FILES_CACHE` keyed by sha1(path + size + mtime), generated through the Photos 2-slot `runLimited` queue, a `.fail` marker remembers undecodable files, a missing `pdftoppm` is remembered for the process lifetime → 404 `No preview`), `stat` (bounded recursive totals for the delete confirm) and `status` (`{ online, root, disk }`). Dot-entries, `#recycle`, `#snapshot`, `@eaDir` and `*.part` are hidden everywhere (`isHiddenName`). **Mount guard:** with `NAS_REQUIRE_MOUNT=1` a root that is not a mount point (`lib/mount.ts`: same `st_dev` as its parent) is offline — every `/api/files` route answers 503 `{ error: 'Storage offline', offline: true }` (mutating routes after `assertSameOrigin`), and Photos' `checkLibraryOnline()` / scan treat `PHOTOS_ROOT` the same way. A missing root is offline even without the flag.

### Color system

`StatusColor` (`good` → `hazardous`) is the single shared type that drives border classes, value text, sparkline stroke, and AQI badge color. All of it comes from `lib/statusColors.ts` (hex, label, text/border/badge/background classes). Hex values:

```ts
{ good: '#34d399', moderate: '#facc15', sensitive: '#fb923c',
  unhealthy: '#ef4444', 'very-unhealthy': '#a855f7', hazardous: '#e11d48' }
```

(`hazardous` was `#9f1239`, which measured 2.5:1 on the dark background; `#e11d48` is 4.2:1.) Metric cards also show the status word, never colour alone.
