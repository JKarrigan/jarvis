# Photos — family photo & video library

The Photos section turns the home server into the place where the family's own
pictures and videos live. It sits inside the media ("Reel") app at `/media/photos`
and reuses Reel's shell, theme tokens, rail and card primitives. Media files are
plain files on the server's disk (not inside Jellyfin), indexed into SQLite.

## Storage — the NAS owns the files, the Pi is a client

The Synology NAS is the durable store. The Pi mounts a NAS share and only indexes,
serves and renders what is there; nothing irreplaceable lives on the Pi. Losing the
Pi (or its SD card) loses nothing: the index and thumbnails are rebuilt from the
share, and favorites/albums/tags are restored from the catalog file kept on the NAS.

| Setting | Default | Meaning |
|---|---|---|
| `PHOTOS_ROOT` | `$FILES_ROOT/Photos` | The photo library. On the Pi this must be a mounted NAS share, e.g. `/mnt/nas/photo` (Synology's `photo` shared folder works as-is). |
| `PHOTOS_CACHE` | `<app dir>/.photos-cache` | Derived files (thumbnails, previews, poster frames) on the Pi's local disk for speed. Disposable; rebuilt on demand. |

Recommended Pi setup: mount the NAS over NFS (or SMB) at boot, then point
`FILES_ROOT` at the mount root (so the Files app browses the NAS too) and
`PHOTOS_ROOT` at the photo share. An `/etc/fstab` line such as
`NAS_IP:/volume1/photo /mnt/nas/photo nfs defaults,_netdev,soft,timeo=30,retrans=2,noatime 0 0`
keeps a NAS outage from hanging the app process (`soft`): reads fail with an error
instead of blocking forever.

**Mount guard.** On the first successful scan the scanner writes a marker file
`PHOTOS_ROOT/.photos-library` on the NAS. Every later scan refuses to run when that
marker is absent while the index already has rows (the share is not mounted, or an
empty directory is masking the mount point). Without this a missing mount would
look like "every file was deleted". The Photos UI shows an "Library offline" banner
from the scan status in that case.

**Catalog on the NAS.** Favorites, albums and tags are the only state that cannot be
rebuilt from the files. After any change (debounced ~5 s) the server writes
`PHOTOS_ROOT/.library/catalog.json` — albums (name, created, cover), favorites and
`tags` (`{ "<rel_path>": ["Beach", …] }`), all keyed by `rel_path` — and
`lib/photos/scan.ts` imports it when the SQLite tables are empty (fresh Pi, restored SD
card): favorites/albums when there are no albums or favorites, tags when no item has a
tag. A catalog without `tags` (written before tags existed) simply restores none. The
catalog file is small and human-readable.

Originals are never modified. Uploads land in `PHOTOS_ROOT/YYYY/MM/<original name>`
using the capture date when the file carries one (EXIF `DateTimeOriginal`,
QuickTime `creation_time`), else the upload time. A name collision gets a ` (2)`
suffix. Files already on the share in any other layout (existing NAS folders,
Synology Photos' own `YYYY/MM` tree, phone backup folders) are indexed where they
are; the scanner never moves them. Deleting moves the file to
`PHOTOS_ROOT/.trash/` (hidden from the file browser, which skips dot-entries) and
keeps the DB row with `trashed_at` set, so "Recently deleted" can restore it.
Emptying the trash removes the files.

Supported formats: `jpg jpeg png gif webp avif heic heif tiff` (images) and
`mp4 mov m4v webm mkv` (videos). Anything else in the folder is ignored. Dot-entries
(`.cache`, `.trash`, `.library`, Synology's `@eaDir`) are skipped.

## Indexing

SQLite (same `airgradient.db`, `lib/db.ts` singleton):

```
photos(
  id TEXT PRIMARY KEY,            -- 16 hex chars, random, stable for the file's lifetime
  rel_path TEXT UNIQUE NOT NULL,  -- relative to PHOTOS_ROOT, '/' separated
  kind TEXT NOT NULL,             -- 'image' | 'video'
  size INTEGER, mtime INTEGER,
  hash TEXT,                      -- sha1 of size + first 1 MiB + last 64 KiB (cheap dedup)
  taken_at INTEGER NOT NULL,      -- epoch ms; capture time, else mtime
  width INTEGER, height INTEGER,  -- after orientation is applied
  duration REAL,                  -- seconds, videos only
  mime TEXT,
  camera TEXT, lat REAL, lon REAL,
  favorite INTEGER DEFAULT 0,
  trashed_at INTEGER,
  indexed_at INTEGER NOT NULL
)
albums(id TEXT PRIMARY KEY, name TEXT, created_at INTEGER, cover_id TEXT)
album_items(album_id TEXT, photo_id TEXT, added_at INTEGER, PRIMARY KEY(album_id, photo_id))
photo_tags(
  photo_id TEXT NOT NULL,
  tag TEXT NOT NULL,              -- as typed: NFC, trimmed, whitespace collapsed, 1–40 chars, no control chars
  tag_key TEXT NOT NULL,          -- lower-cased tag; all matching goes through it ("Beach" = "beach")
  added_at INTEGER,
  PRIMARY KEY(photo_id, tag_key)
)                                 -- + index on tag_key
```

Tags hang off the photo id, so they follow the item through trash/restore and through
moves the scanner re-links by hash; deleting forever drops them. The first spelling of a
tag in the library wins: adding "beach" where "Beach" exists stores "Beach". Normalisation
lives in `lib/photos/tags.ts` (client-safe, shared by the routes and the UI).

`lib/photos/scan.ts` walks `PHOTOS_ROOT` (skipping dot-entries), inserts rows for
new files, refreshes rows whose size/mtime changed, and marks rows whose file is
gone as `trashed_at = now` with `rel_path` prefixed `.missing/` so they drop out of
views (only when the mount guard passes, see Storage). A scan runs at server start (after the poller), every 6 hours, right after
an upload, and on demand from the Photos settings sheet. Metadata comes from
`sharp.metadata()` + `exif-reader` for images and `ffprobe -show_format
-show_streams` for videos and HEIC. Only one scan runs at a time (globalThis lock).

## Derived images

`lib/photos/thumbs.ts` produces, lazily on first request and cached in
`PHOTOS_CACHE/<id>/`:

| Name | Size | Use |
|---|---|---|
| `t.webp` | 400 px on the long edge | grid tiles |
| `p.webp` | 1600 px on the long edge | lightbox, before the original loads |
| `poster.webp` | 1600 px frame at 1 s | videos (also used for `t.webp`) |

Images go through sharp (`rotate()` applies EXIF orientation). HEIC/HEIF goes
through `ffmpeg -i x.heic -frames:v 1` (sharp's prebuilt libvips only decodes
AVIF) and then sharp. Videos use `ffmpeg -ss 1 -frames:v 1`. A per-process queue
limits concurrent ffmpeg/sharp work to 2 so a Raspberry Pi stays responsive; a
background pass after each scan fills `t.webp` for anything new.

## API (`app/api/photos/**`)

| Route | Purpose |
|---|---|
| `GET /api/photos?cursor&limit&kind&favorite&album&tag&year&month` | Timeline page, newest first; returns items (each with `tags`) + `nextCursor` (taken_at,id keyset). `tag` matches case-insensitively |
| `GET /api/photos/summary` | Counts per year/month for the timeline scrubber, totals, disk usage, last scan |
| `GET /api/photos/[id]` | One item with full metadata, its albums and tags |
| `PATCH /api/photos/[id]` | `{ favorite?, tags? }` (at least one; `tags` replaces the item's tags, max 100) → the updated item |
| `GET /api/photos/tags` | `[{ tag, count }]` over live items, by count desc then name |
| `POST /api/photos/tags` | `{ ids (1–1000), add?, remove? }` (≤ 50 tags each; a tag in both is removed) → `{ ok, changed }` (items whose tags changed) |
| `DELETE /api/photos/[id]` | Move to trash; `?restore=1` restores; `?permanent=1` removes |
| `GET /api/photos/[id]/thumb` `?size=t|p` | Derived webp (cached, immutable headers) |
| `GET /api/photos/[id]/file` | Original with Range support (`?download=1` sets attachment) |
| `GET /api/photos/[id]/stream` | H.264 720p transcode for videos the browser cannot play (HEVC `.mov` in Chrome) |
| `POST /api/photos/upload` | multipart, many files; dedups by hash; returns created/skipped per file |
| `POST /api/photos/scan` | Trigger a scan; `GET` returns status |
| `GET/POST /api/photos/albums`, `GET/PATCH/DELETE /api/photos/albums/[id]`, `POST/DELETE /api/photos/albums/[id]/items` | Albums |
| `GET /api/photos/trash`, `POST /api/photos/trash/empty` | Recently deleted |

Validation: ids are `^[0-9a-f]{16}$`; limits are clamped; every path comes from
the DB row, never from the request.

## UI (`app/media/photos/**`, `app/_components/media/photos/**`)

- Rail: a **Photos** entry (camera icon) after TV Shows on desktop; on mobile it
  takes the slot Collections had (Collections stays reachable from Home and desktop).
- `/media/photos` — **Timeline**: month sections with sticky headers, a square grid
  (`--grid-min` aware), infinite scroll via `IntersectionObserver`, a year/month
  jump list on desktop, filter chips (All · Photos · Videos · Favorites), an
  Upload button (multi-file, `accept="image/*,video/*"`, XHR progress, per-file
  result), and a Select mode (long-press / checkbox) with Favorite · Add to album ·
  Tag · Delete actions on a bottom action bar.
- **Tags**: a "Tags" dropdown in the filter row lists every tag with its count; picking
  one filters the timeline (a clearable chip, kept in the URL as `?tag=` so it survives
  reload and Back). Select → Tag opens a sheet: type a new tag (Enter adds it to the whole
  selection) or toggle existing ones — each is a tri-state checkbox (on all / some / none
  of the selected items) and applies to the whole selection at once. The viewer's info
  sheet has a Tags section (chips with ×, an input with suggestions; optimistic, reverted
  on error); `T` opens it with the input focused. Album detail has the same Tag action.
- `/media/photos/albums` and `/media/photos/albums/[id]` — album grid with cover
  tiles; album detail reuses the timeline grid with an album filter plus Rename /
  Set cover / Delete album.
- `/media/photos/trash` — Recently deleted, Restore / Delete forever / Empty.
- **Viewer** (`PhotoViewer.tsx`): full-screen lightbox over the current page
  (query `?v=<id>` so back closes it and the URL is shareable), swipe and arrow
  keys, pinch/double-tap zoom on images, native `<video>` for videos with a
  fallback to `/stream` when `canPlayType` rejects the codec, info sheet (date,
  camera, size, dimensions, location link, albums, tags), favorite, download, delete.
  Keys: ←/→, Esc, F favorite, I info, T tag, Space play/pause.
- Media Home gets a **Memories** row: "On this day" items from previous years,
  else the latest additions. Search modal gets albums.

## Non-goals (this round)

Face/object recognition, automatic phone backup clients, sharing links outside the
LAN, editing. These fit later without changing the storage layout.
