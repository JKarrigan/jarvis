# Home

A self-hosted home dashboard that runs on a Raspberry Pi on the LAN. It is one
Next.js 16 (App Router) app with two halves, switched from the top-left app
switcher:

- **Air**: live readings from a local [AirGradient](https://www.airgradient.com/)
  monitor, history charts and detected events (`/`, `/air-quality`, `/events`, …).
- **Lights**: Philips Hue rooms and lights (`/lights`).
- **Files**: a browser for the NAS storage with upload, rename, move and in-browser
  playback (`/files`).
- **Media / Reel**: movies, TV, audiobooks and readable books from Jellyfin on
  the NAS (`/media`).
- **Photos**: the family photo and video library (`/media/photos`).

There is no login: the app is meant for the home network only.

## Architecture

Start with [`CLAUDE.md`](CLAUDE.md) (data flow, key modules, env vars, the
audiobook/books/read-along design) and the specs in [`docs/`](docs/):

- [`docs/reel-spec.md`](docs/reel-spec.md): the media UI's design tokens and interactions.
- [`docs/photos-spec.md`](docs/photos-spec.md): photo storage, indexing and API.

In short: server code in `lib/` (SQLite via `better-sqlite3`, Jellyfin, Hue,
files, photos) behind thin route handlers in `app/api/`; UI in `app/(air)/`,
`app/media/` and `app/_components/`. Note that this Next.js version differs from
older releases; check `node_modules/next/dist/docs/` before changing framework code.

## Development

Requires Node 20.9 or newer (`.nvmrc` pins 22). ffmpeg/ffprobe on `PATH` are
needed for video playback, audiobook chapters and photo thumbnails.

```bash
npm install
cp .env.example .env.local   # optional; everything has a default
npm run dev                  # http://localhost:3000

npm run lint                 # ESLint
npm run typecheck            # tsc --noEmit
npm test                     # Vitest (tests/**, lib/**/*.test.ts)
npm run build                # production build
```

With no `JELLYFIN_*` variables the media section serves mock data, so the UI
works without the NAS. To open the dev server from a phone, add your machine's
LAN IP to `DEV_ORIGINS`. All variables are documented in
[`.env.example`](.env.example).

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and a build on
Node 22 for every push and pull request.

## Storage: the NAS comes first

The Synology NAS is the durable store; the Pi is a client. Media, files and
photos live on NAS shares mounted on the Pi (`FILES_ROOT`, `PHOTOS_ROOT`), and
the Pi only indexes, serves and renders them. Everything on the Pi itself (the
SQLite index, `PHOTOS_CACHE` thumbnails) can be rebuilt from the NAS, and the
little state that cannot (photo favorites and albums) is written back to the
NAS as a catalog file. Losing the Pi or its SD card should lose nothing. See
[`docs/photos-spec.md`](docs/photos-spec.md) for the mount setup (`soft` NFS
mount) and the guard that stops a missing mount from looking like a deleted
library.

## Deploying to the Pi

Step-by-step setup with the NAS mounted as storage (NFS share, env vars,
ffmpeg, first-run checks): [docs/pi-deploy.md](docs/pi-deploy.md).

The Pi runs the app under [PM2](https://pm2.keymetrics.io/) (process `jarvis`,
defined in `ecosystem.config.cjs`) and deploys on `git push`:

1. Clone the repo onto the Pi (e.g. `~/air-gradient`), create `.env.local`
   there, and run `scripts/pi-setup.sh` once. It lets the checkout accept
   pushes, installs PM2, adds a `post-receive` hook, builds and starts the app,
   and registers PM2 to start on boot (run the `pm2 startup` command it prints).
2. On your laptop: `git remote add pi <user>@<pi-ip>:~/air-gradient`.
3. Deploy with `git push pi main`. The hook runs `npm ci` (dev dependencies
   included, the build needs them), `npm run build`, prunes dev dependencies and
   reloads PM2.

Logs: `pm2 logs jarvis` (`pm2 install pm2-logrotate` keeps them bounded). Long
jobs such as read-along narration syncing (`scripts/sync-narration.py`) run on
a faster machine, never on the Pi.
