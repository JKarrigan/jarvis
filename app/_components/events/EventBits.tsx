import Link from 'next/link'
import type { AirQualityEvent, Severity } from '@/lib/eventTypes'
import {
  METRIC_INFO, SEVERITY_INFO, SEVERITY_RANK, eventMinutes, eventTitle, fmtDuration, fmtMetric, keyMetrics,
} from '@/lib/eventInfo'

/**
 * The pieces every event surface is built from (log, detail, dashboards), so
 * an event looks the same wherever it shows up: the severity mark, its key
 * numbers, one row, and a day drawn as a midnight-to-midnight track.
 * Times are formatted in the browser's locale and zone: render these only
 * after hydration (every caller gets its events from a client fetch).
 */

// ─── Time ────────────────────────────────────────────────────────────────────

/** "4:47 pm" (or "16:47" where the locale uses a 24-hour clock). */
export function fmtClock(d: Date | number): string {
  return new Date(d)
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .replace(/\s?(AM|PM)$/i, m => ` ${m.trim().toLowerCase()}`)
}

/** "Sat, Nov 21". */
export function fmtDay(d: Date | number): string {
  return new Date(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "Sat" for a list that spans a few days. */
export function fmtWeekday(d: Date | number): string {
  return new Date(d).toLocaleDateString([], { weekday: 'short' })
}

/** Local midnight at or before `ms`. */
export function startOfDay(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Local midnight `days` days after the day containing `ms` (DST-safe). */
export function addDays(ms: number, days: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime()
}

/** "Today", "Yesterday" or null. */
export function relativeDay(dayStart: number, now: number): string | null {
  const today = startOfDay(now)
  if (dayStart === today) return 'Today'
  if (dayStart === addDays(today, -1)) return 'Yesterday'
  return null
}

// ─── Severity ────────────────────────────────────────────────────────────────

/**
 * A ring for notable, a triangle for a warning, a square for critical: the
 * shape carries the severity before the colour does.
 */
export function SeverityMark({ severity, size = 10, className = '' }: { severity: Severity; size?: number; className?: string }) {
  const { hex } = SEVERITY_INFO[severity]
  const base = { width: size, height: size }
  const style =
    severity === 'critical' ? { ...base, backgroundColor: hex, borderRadius: 2 }
    : severity === 'warning' ? { ...base, backgroundColor: hex, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }
    : { ...base, border: `1.5px solid ${hex}`, borderRadius: '50%' }
  return <span aria-hidden="true" className={`inline-block shrink-0 ${className}`} style={style} />
}

/** Mark plus word. */
export function SeverityLabel({ severity, className = '' }: { severity: Severity; className?: string }) {
  const info = SEVERITY_INFO[severity]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium ${info.textClass} ${className}`}>
      <SeverityMark severity={severity} />
      {info.label}
    </span>
  )
}

// ─── Numbers ─────────────────────────────────────────────────────────────────

/** "PM2.5 119 µg/m³ · VOC 477 · NOx 4": the lead reading with its unit, then whatever else moved. */
export function KeyNumbers({ event, max = 3 }: { event: Pick<AirQualityEvent, 'type' | 'peak' | 'baseline'>; max?: number }) {
  const metrics = keyMetrics(event).slice(0, max)
  return (
    <>
      {metrics.map((m, i) => (
        <span key={m}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          {i === 0 ? METRIC_INFO[m].label : METRIC_INFO[m].short}{' '}
          <span className="font-medium text-zinc-100">{fmtMetric(m, event.peak[m])}</span>
          {METRIC_INFO[m].unit && (i === 0 || m === 'pm02') ? ` ${METRIC_INFO[m].unit}` : ''}
        </span>
      ))}
    </>
  )
}

// ─── Row ─────────────────────────────────────────────────────────────────────

const chevron = (
  <svg aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-zinc-400 sm:block" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.5 5l5 5-5 5" />
  </svg>
)

/** Where a row leads. */
export function eventHref(id: string): string {
  return `/events/${encodeURIComponent(id)}`
}

/**
 * One event as a link to its page. On a phone it is two lines (name over
 * numbers, start over duration); from `sm` one line with the time range.
 * `showDay` prefixes the weekday for lists that span several days.
 */
export function EventRow({ event, now, showDay = false, className = '' }: {
  event: AirQualityEvent
  /** Current time (minute resolution) so an event still going shows how long it has lasted. */
  now: number | null
  showDay?: boolean
  className?: string
}) {
  const ongoing = event.endTime === null
  const day = showDay ? `${fmtWeekday(event.startTime)} ` : ''
  const start = fmtClock(event.startTime)
  const duration = fmtDuration(eventMinutes(event, now))
  return (
    <Link
      href={eventHref(event.id)}
      className={`flex min-h-[52px] items-center gap-3 px-4 py-2 transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 md:px-5 ${className}`}
    >
      <SeverityMark severity={event.severity} />
      <span className="sr-only">{SEVERITY_INFO[event.severity].label}:</span>
      <span className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <span className="block truncate text-sm font-medium text-zinc-50 sm:w-[150px] sm:shrink-0 lg:w-[170px]">{eventTitle(event.type)}</span>
        <span className="block truncate text-[13px] tabular-nums text-zinc-400 sm:flex-1 sm:text-sm"><KeyNumbers event={event} /></span>
      </span>
      <span aria-hidden="true" className={`hidden w-[72px] shrink-0 text-[13px] font-medium lg:block ${SEVERITY_INFO[event.severity].textClass}`}>
        {SEVERITY_INFO[event.severity].label}
      </span>
      <span className="shrink-0 text-right tabular-nums sm:flex sm:items-center sm:gap-4">
        <span className="block text-[13px] text-zinc-200 sm:text-sm sm:text-zinc-400">
          {day}{start}
          {ongoing
            ? <span className="ml-2 font-medium text-emerald-400">ongoing</span>
            : <span className="hidden sm:inline"> to {fmtClock(event.endTime!)}</span>}
        </span>
        <span className="block text-[13px] text-zinc-400 sm:w-[84px] sm:text-sm">{duration}</span>
      </span>
      {chevron}
    </Link>
  )
}

// ─── Day track ───────────────────────────────────────────────────────────────

/**
 * One day from midnight to midnight with its events as bars, so the time of
 * day lines up from one day to the next. Bars are a picture of the rows shown
 * with the track, so they are hidden from assistive tech and the tab order.
 * `linked` makes each bar a link to its event; leave it off when the track
 * sits inside a button.
 */
export function DayTrack({ dayStart, events, now, linked = false, className = '' }: {
  dayStart: number
  events: AirQualityEvent[]
  now: number | null
  linked?: boolean
  className?: string
}) {
  const dayEnd = addDays(dayStart, 1)
  const span = dayEnd - dayStart
  const bars = events
    .map(e => {
      const from = Math.max(e.startTime.getTime(), dayStart)
      const to = Math.min(e.endTime?.getTime() ?? now ?? e.startTime.getTime() + e.durationMinutes * 60_000, dayEnd)
      return { e, left: ((from - dayStart) / span) * 100, width: ((to - from) / span) * 100 }
    })
    .filter(b => b.width > 0 || b.e.endTime === null)
    // Worst last, so it is drawn on top where bars overlap.
    .sort((a, b) => SEVERITY_RANK[a.e.severity] - SEVERITY_RANK[b.e.severity])
  const nowLeft = now != null && now >= dayStart && now < dayEnd ? ((now - dayStart) / span) * 100 : null
  return (
    <div aria-hidden="true" className={`relative h-5 rounded-md bg-air-raised ${className}`}>
      {bars.map(({ e, left, width }) => {
        const bar = {
          title: `${eventTitle(e.type)}, ${fmtClock(e.startTime)}`,
          className: 'absolute bottom-[3px] top-[3px] min-w-1 rounded-[3px]',
          style: { left: `${left}%`, width: `${width}%`, backgroundColor: SEVERITY_INFO[e.severity].barHex },
        }
        return linked
          ? <Link key={e.id} href={eventHref(e.id)} tabIndex={-1} {...bar} className={`${bar.className} transition-opacity hover:opacity-80`} />
          : <span key={e.id} {...bar} />
      })}
      {nowLeft != null && <span className="absolute bottom-0 top-0 w-px bg-emerald-400" style={{ left: `${nowLeft}%` }} />}
    </div>
  )
}

/** "12 am · 6 am · Noon · 6 pm · 12 am" under (or over) a DayTrack. */
export function HourAxis({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const ticks = [
    { at: 0, label: '12 am' }, { at: 25, label: compact ? '6' : '6 am' }, { at: 50, label: 'Noon' },
    { at: 75, label: compact ? '6' : '6 pm' }, { at: 100, label: '12 am' },
  ]
  return (
    <div aria-hidden="true" className={`relative h-4 text-[11px] text-zinc-400 ${className}`}>
      {ticks.map(t => (
        <span
          key={t.at}
          className="absolute top-0 whitespace-nowrap"
          style={{ left: `${t.at}%`, transform: t.at === 0 ? undefined : t.at === 100 ? 'translateX(-100%)' : 'translateX(-50%)' }}
        >
          {t.label}
        </span>
      ))}
    </div>
  )
}
