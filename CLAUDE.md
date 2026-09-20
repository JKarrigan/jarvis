# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # start dev server (http://localhost:3000)
npm run build    # production build
npm run lint     # ESLint
npx tsc --noEmit # type-check without emitting
```

No test suite exists yet.

## Architecture

This is a Next.js 16 App Router app that polls a local [AirGradient](https://www.airgradient.com/) device and stores readings in a local SQLite database.

### Data flow

1. **Server poller** (`lib/poller.ts`) — a `globalThis` singleton that runs `setInterval` inside the Next.js server process, fetching `/measures/current` from the device every 10 s and writing rows to SQLite via `lib/db.ts`. Survives hot reloads by storing state on `globalThis`.
2. **SQLite** (`lib/db.ts`) — another `globalThis` singleton (`better-sqlite3`). Single table: `readings(id, timestamp, data TEXT)` where `data` is JSON-stringified `DeviceMeasures`. Readings older than 30 days are pruned on each `/api/history` call.
3. **API routes** (`app/api/`) — thin wrappers around `lib/db.ts` and `lib/poller.ts`. No auth. `better-sqlite3` must stay server-side; it is listed in `serverExternalPackages` in `next.config.ts`.
4. **PollingProvider** (`app/_components/PollingProvider.tsx`) — client-side React context that polls `/api/latest` every 10 s and hydrates from `/api/history?limit=3600` on mount. Stores up to 3600 history entries in memory. Persists device IP, PM batch ID, and outdoor lat/lon to `localStorage`.
5. **Dashboard** — `DashboardShell` reads from `PollingProvider` and passes props down to `Dashboard`, which renders the AQI hero, 8 metric cards, and history charts.

### Key lib files

| File | Purpose |
|---|---|
| `lib/types.ts` | `DeviceMeasures`, `HistoryEntry`, `ComputedAqi`, `StatusColor` |
| `lib/aqi.ts` | `computeAqi(pm25)` → EPA AQI; `aqiToColor(aqi)` → `StatusColor` |
| `lib/thresholds.ts` | Per-metric `StatusColor` functions (`co2Status`, `pm25Status`, …) |
| `lib/pmCalibration.ts` | Batch-specific PMS5003 correction factors (client-side only) |

### Env vars

| Variable | Where used |
|---|---|
| `NEXT_PUBLIC_DEVICE_HOST` | Client fallback device IP if no `localStorage` value |
| `DB_PATH` | Override SQLite file location (default: `airgradient.db` in cwd) |
| `OUTDOOR_LAT` / `OUTDOOR_LON` | Server-side fallback coordinates for `/api/outdoor-aqi` |
| `FILES_ROOT` | Root dir for the file browser / local media transcoding (default: `/mnt/storage`) — `lib/files.ts` |
| `FFMPEG_PATH` / `FFPROBE_PATH` | ffmpeg/ffprobe binaries for local file streaming (default: on `PATH`) |
| `JELLYFIN_URL` | Jellyfin server base URL, e.g. `http://NAS_IP:8096` — `lib/jellyfinServer.ts` |
| `JELLYFIN_USER` / `JELLYFIN_PASSWORD` | Dashboard user the frontend authenticates as (token cached server-side) |
| `JELLYFIN_API_KEY` | Alternative to user/password (admin-wide; server-side only). Optional `JELLYFIN_USER_ID` selects the user for user-scoped calls |

When none of the `JELLYFIN_*` vars are set, `lib/jellyfinServer.ts` serves mock data so the media UI still renders in dev.

### Audiobooks

Audiobooks are a separate model from movies/TV (`Audiobook*` types, not `ReelTitle`) — `lib/jellyfinAudiobooks.ts` reads Jellyfin `AudioBook` items (a **Books** library, one M4B per book). Jellyfin 10.11 does not return chapter markers for audiobooks, so they are read with `ffprobe` over the Direct Play stream and cached in the SQLite `settings` table (`audiobook.chapters.<id>.<size>`); Jellyfin's own `Chapters` win if a future release provides them. Playback is *not* `JellyfinPlayer`: `app/_components/media/audiobooks/AudiobookPlayer.tsx` is a provider mounted in `MediaShell` (outside `PageTransition`) that owns a single `<audio>` element so a book keeps playing across navigation; `PlayerChrome.tsx` renders the docked mini player and the full now-playing sheet. Resume position lives in Jellyfin (progress reported through `/api/jellyfin/report`); only the loaded book id, speed and volume are in `localStorage` (`reel.audiobook.v1`).

### Books (reading)

The Books rail entry has two halves: **Listen** (`/media/audiobooks`, above) and **Read** (`/media/books`). Readable books are Jellyfin `Book` items (PDFs in a second Books library, laid out `Author/Title/Title.pdf`) — `lib/jellyfinBooks.ts`. Jellyfin only indexes them, so: the author falls back to the grandparent folder name, a `Level N` tag becomes the graded-reader level filter, covers are rendered from page 1 **in the browser** and posted to `/api/jellyfin/books/[id]/cover`, which stores them as the item's Primary image, and the reading position lives in the SQLite `settings` table (`book.progress.<id>`), not Jellyfin. The reader (`app/_components/media/books/BookReader.tsx`) uses `pdfjs-dist` (legacy build); its worker, CJK cmaps, fonts and wasm are served from `node_modules` by `app/api/pdfjs/[...path]` and the PDF itself is range-proxied through `/api/jellyfin/books/[id]/file`.

**Read-along narration:** Jellyfin resolves a `Title/` folder to the Book and ignores an MP3 placed beside the PDF, so a book's narration lives in the *Audiobooks* library at the same `Author/Title/Title.mp3` path. `folderKey()` in `lib/jellyfinBooks.ts` pairs them (`Ebook.audioId`); the reader plays it through the persistent audiobook player (play / back 5 s / 1×·0.8×·0.6×, speed remembered per book), and `getAudiobooks()` leaves paired narrations off the Listen shelf, Home and search.

### Color system

`StatusColor` (`good` → `hazardous`) is the single shared type that drives border classes, value text, sparkline stroke, and AQI badge color. Hex equivalents used in SVG contexts:

```ts
{ good: '#34d399', moderate: '#facc15', sensitive: '#fb923c',
  unhealthy: '#ef4444', 'very-unhealthy': '#a855f7', hazardous: '#9f1239' }
```
