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

### Color system

`StatusColor` (`good` → `hazardous`) is the single shared type that drives border classes, value text, sparkline stroke, and AQI badge color. Hex equivalents used in SVG contexts:

```ts
{ good: '#34d399', moderate: '#facc15', sensitive: '#fb923c',
  unhealthy: '#ef4444', 'very-unhealthy': '#a855f7', hazardous: '#9f1239' }
```
