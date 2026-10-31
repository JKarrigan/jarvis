import { assertSameOrigin } from '@/lib/http'
import { isItemId, reportPlayback } from '@/lib/jellyfinServer'
import { isReportKind, type PlaybackReport } from '@/app/_components/media/playback'
import { TOO_LARGE, badRequest, readJsonCapped, tooLarge } from '../_lib/request'

const MAX_BODY = 16 * 1024
const SESSION_ID = /^[\w-]{1,80}$/
const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : undefined)

// Forwards playback progress to Jellyfin (start / progress / stopped) so the
// dashboard user's "Continue Watching" / resume position stays in sync. Only known
// fields are forwarded; an unknown kind is rejected (it used to count as 'stopped').
export async function POST(request: Request) {
  const denied = assertSameOrigin(request)
  if (denied) return denied
  const payload = await readJsonCapped<{ kind?: unknown; report?: Record<string, unknown> }>(request, MAX_BODY)
  if (payload === TOO_LARGE) return tooLarge(MAX_BODY)
  if (!payload || typeof payload !== 'object') return badRequest('Invalid JSON')
  const { kind, report } = payload
  if (!isReportKind(kind)) return badRequest('Invalid kind')
  if (!report || !isItemId(report.ItemId)) return badRequest('Missing report.ItemId')
  const clean: PlaybackReport = {
    ItemId: report.ItemId,
    PlaySessionId: typeof report.PlaySessionId === 'string' && SESSION_ID.test(report.PlaySessionId) ? report.PlaySessionId : undefined,
    MediaSourceId: typeof report.MediaSourceId === 'string' && SESSION_ID.test(report.MediaSourceId) ? report.MediaSourceId : undefined,
    PositionTicks: int(report.PositionTicks, Number.MAX_SAFE_INTEGER),
    IsPaused: typeof report.IsPaused === 'boolean' ? report.IsPaused : undefined,
    AudioStreamIndex: int(report.AudioStreamIndex, 999),
    SubtitleStreamIndex: int(report.SubtitleStreamIndex, 999),
    PlaybackRate: typeof report.PlaybackRate === 'number' && report.PlaybackRate > 0 && report.PlaybackRate <= 4 ? report.PlaybackRate : undefined,
  }
  const ok = await reportPlayback(kind, clean)
  return Response.json({ ok }, { status: ok ? 200 : 502 })
}
