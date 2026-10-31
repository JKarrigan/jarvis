/**
 * Shared playback plumbing for the video player (JellyfinPlayer), the audiobook
 * player and the server mappers: Jellyfin tick conversion and progress reporting.
 * Pure + isomorphic — `postPlaybackReport` is only ever called from the browser.
 */

/** Jellyfin times are in 100 ns "ticks". */
export const TICKS_PER_SECOND = 10_000_000
export const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

export function ticksToSeconds(ticks?: number | null): number {
  return (ticks ?? 0) / TICKS_PER_SECOND
}

export function secondsToTicks(seconds: number): number {
  return Math.round(Math.max(0, seconds) * TICKS_PER_SECOND)
}

/** Whole minutes, or undefined for a missing/zero runtime. */
export function ticksToMinutes(ticks?: number | null): number | undefined {
  return ticks ? Math.round(ticks / TICKS_PER_MINUTE) : undefined
}

export const REPORT_KINDS = ['start', 'progress', 'stopped'] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

export function isReportKind(v: unknown): v is ReportKind {
  return typeof v === 'string' && (REPORT_KINDS as readonly string[]).includes(v)
}

/** The body forwarded to Jellyfin's /Sessions/Playing[/Progress|/Stopped]. */
export interface PlaybackReport {
  ItemId: string
  PlaySessionId?: string
  MediaSourceId?: string
  PositionTicks?: number
  IsPaused?: boolean
  AudioStreamIndex?: number
  SubtitleStreamIndex?: number
  PlaybackRate?: number
}

/**
 * Post a playback report through /api/jellyfin/report. `stopped` reports use
 * keepalive so they survive the page being closed. Never throws.
 */
export function postPlaybackReport(kind: ReportKind, report: PlaybackReport, opts: { keepalive?: boolean } = {}): Promise<boolean> {
  return fetch('/api/jellyfin/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, report }),
    keepalive: opts.keepalive ?? kind === 'stopped',
  }).then(r => r.ok, () => false)
}
