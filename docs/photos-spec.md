# Photos — family photo & video library

The Photos section turns the home server into the place where the family's own
pictures and videos live. It sits inside the media ("Reel") app at `/media/photos`
and reuses Reel's shell, theme tokens, rail and card primitives. Media files are
plain files on the server's disk (not inside Jellyfin), indexed into SQLite.

## Storage — the NAS owns the files, the Pi is a client

The Synology NAS is the durable store. The Pi mounts a NAS share and only indexes,
serves and renders what is there; nothing irreplaceable lives on the Pi. Losing the
Pi (or its SD card) loses nothing: the index and thumbnails are rebuilt from the
share, and favorites/albums are restored from the catalog file kept on the NAS.

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

**Catalog on the NAS.** Favorites and albums are the only state that cannot be
rebuilt from the files. After any change (debounced ~5 s) the server writes
`PHOTOS_ROOT/.library/catalog.json` — albums (name, created, cover) and favorites,
keyed by `rel_path` — and `lib/photos/scan.ts` imports it when the SQLite tables are
empty (fresh Pi, restored SD card). The catalog file is small and human-readable.

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
```

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
| `GET /api/photos?cursor&limit&kind&favorite&album&year&month` | Timeline page, newest first; returns items + `nextCursor` (taken_at,id keyset) |
| `GET /api/photos/summary` | Counts per year/month for the timeline scrubber, totals, disk usage, last scan |
| `GET /api/photos/[id]` | One item with full metadata and its albums |
| `PATCH /api/photos/[id]` | `{ favorite }` |
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
  Delete actions on a bottom action bar.
- `/media/photos/albums` and `/media/photos/albums/[id]` — album grid with cover
  tiles; album detail reuses the timeline grid with an album filter plus Rename /
  Set cover / Delete album.
- `/media/photos/trash` — Recently deleted, Restore / Delete forever / Empty.
- **Viewer** (`PhotoViewer.tsx`): full-screen lightbox over the current page
  (query `?v=<id>` so back closes it and the URL is shareable), swipe and arrow
  keys, pinch/double-tap zoom on images, native `<video>` for videos with a
  fallback to `/stream` when `canPlayType` rejects the codec, info sheet (date,
  camera, size, dimensions, location link), favorite, download, delete.
- Media Home gets a **Memories** row: "On this day" items from previous years,
  else the latest additions. Search modal gets albums.

## Non-goals (this round)

Face/object recognition, automatic phone backup clients, sharing links outside the
LAN, editing. These fit later without changing the storage layout.
