'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import type { AirQualityEvent, EventTrace } from '@/lib/eventTypes'
import type { HistoryEntry } from '@/lib/types'
import {
  EVENT_METRICS, METRIC_INFO, SEVERITY_INFO, SEVERITY_LIMITS, eventCauses, eventMinutes, eventTitle, fmtDuration, fmtMetric, fmtMetricWithUnit,
  isAlert, leadMetric, metricStatus, vocWord, type EventMetric,
} from '@/lib/eventInfo'
import { STATUS_COLORS } from '@/lib/statusColors'
import { useNowMinute } from '@/lib/useNow'
import { reviveEvent, usePolling } from '../PollingProvider'
import { toUnit } from '../Dashboard'
import { Modal } from '../lights/dialog'
import { Card, Page, PageHeader, PageState, SectionTitle, Spinner, btnCls, cardCls } from '../air/ui'
import { KeyNumbers, SeverityLabel, SeverityMark, eventHref, fmtClock, fmtDay, fmtWeekday, startOfDay } from './EventBits'
import { EventLanes, type Lane } from './EventLanes'

type WireEvent = Parameters<typeof reviveEvent>[0]
type BriefEvent = Pick<AirQualityEvent, 'id' | 'type' | 'severity' | 'startTime' | 'endTime' | 'peak' | 'baseline'>

interface Related {
  newerId: string | null
  olderId: string | null
  overlapping: BriefEvent[]
  recent: { id: string; startTime: string }[]
}

interface Loaded { event: AirQualityEvent; readings: HistoryEntry[]; related: Related }

const PAD_MS = 15 * 60_000
const REFRESH_MS = 30_000
const OFTEN_DAYS = 14
/** "Around this time" = within two hours of this event's start, on the clock. */
const OFTEN_WINDOW_MIN = 120
/** Fewer than this many days out of 14 is not a pattern worth pointing out. */
const OFTEN_MIN_DAYS = 4

const iconBtnCls = `${btnCls} w-10 !px-0`

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

/** "Sat, Nov 21, 4:47 pm to 11:32 pm" (the end gets its weekday when it is another day). */
function whenLine(event: AirQualityEvent): string {
  const start = `${fmtDay(event.startTime)}, ${fmtClock(event.startTime)}`
  if (!event.endTime) return `${start}, still going`
  const days = (startOfDay(event.endTime.getTime()) - startOfDay(event.startTime.getTime())) / 86_400_000
  // A weekday is enough for "the next morning"; a week or more needs the date.
  const endDay = days < 0.5 ? '' : days < 6.5 ? `${fmtWeekday(event.endTime)} ` : `${fmtDay(event.endTime)}, `
  return `${start} to ${endDay}${fmtClock(event.endTime)}`
}

function fmtHour(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric' }).replace(/\s?(AM|PM)$/i, m => ` ${m.trim().toLowerCase()}`)
}

/**
 * Which of the 14 days before this event had one of the same kind starting
 * within two hours of the same time of day. Oldest first.
 */
function sameTimeDays(event: AirQualityEvent, recent: Related['recent']): boolean[] {
  const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes()
  const at = minuteOfDay(event.startTime)
  const day0 = startOfDay(event.startTime.getTime())
  const hits = new Array<boolean>(OFTEN_DAYS).fill(false)
  for (const r of recent) {
    const start = new Date(r.startTime)
    const diff = Math.abs(minuteOfDay(start) - at)
    if (Math.min(diff, 1440 - diff) > OFTEN_WINDOW_MIN) continue
    const daysAgo = Math.round((day0 - startOfDay(start.getTime())) / 86_400_000)
    if (daysAgo >= 1 && daysAgo <= OFTEN_DAYS) hits[OFTEN_DAYS - daysAgo] = true
  }
  return hits
}

/** Time series for the lanes: stored readings when there are any, else the event's saved trace. */
function buildSeries(readings: HistoryEntry[], trace: EventTrace | null | undefined, tempUnit: 'C' | 'F') {
  const n = (v: number | undefined | null) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  if (readings.length > 1) {
    return {
      source: 'readings' as const,
      ts: readings.map(r => r.timestamp),
      pm02: readings.map(r => n(r.measures.pm02)),
      tvocIndex: readings.map(r => n(r.measures.tvocIndex)),
      noxIndex: readings.map(r => n(r.measures.noxIndex)),
      rco2: readings.map(r => n(r.measures.rco2)),
      temp: readings.map(r => { const c = n(r.measures.atmpCompensated ?? r.measures.atmp); return c == null ? null : toUnit(c, tempUnit) }),
      hum: readings.map(r => n(r.measures.rhumCompensated ?? r.measures.rhum)),
      pm01: readings.map(r => n(r.measures.pm01)),
      pm10: readings.map(r => n(r.measures.pm10)),
    }
  }
  if (trace) {
    return {
      source: 'trace' as const,
      ts: trace.pm02.map((_, i) => trace.from + i * trace.stepMs + trace.stepMs / 2),
      pm02: trace.pm02, tvocIndex: trace.tvocIndex, noxIndex: trace.noxIndex, rco2: trace.rco2,
      temp: [], hum: [], pm01: [], pm10: [],
    }
  }
  return null
}

function rangeNote(values: (number | null)[], format: (v: number) => string): string | undefined {
  const present = values.filter((v): v is number => v != null)
  if (present.length === 0) return undefined
  return `${format(Math.min(...present))} to ${format(Math.max(...present))}`
}

const one = (v: number) => (Math.round(v * 10) / 10).toString()

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-air-line py-2.5 first:border-t-0">
      <dt className="text-sm text-zinc-400">{label}</dt>
      <dd className="text-right text-sm tabular-nums text-zinc-100">{children}</dd>
    </div>
  )
}

export function EventDetail({ id }: { id: string }) {
  const router = useRouter()
  const { tempUnit, acknowledgeEvent, refreshEvents } = usePolling()
  const nowMinute = useNowMinute()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<'missing' | 'failed' | null>(null)
  const [reload, setReload] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState<'busy' | 'failed' | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      let ongoing = false
      try {
        const res = await fetch(`/api/events/${encodeURIComponent(id)}`, { signal: ac.signal })
        if (res.status === 404) { setError('missing'); return }
        if (!res.ok) throw new Error('failed')
        const raw = await res.json() as { event: WireEvent; readings: HistoryEntry[]; related: Related }
        const event = reviveEvent(raw.event)
        ongoing = event.endTime === null
        setData({
          event,
          readings: raw.readings,
          related: { ...raw.related, overlapping: raw.related.overlapping.map(e => reviveEvent(e as unknown as WireEvent)) },
        })
        setError(null)
      } catch {
        if (ac.signal.aborted) return
        setError('failed')
        ongoing = true // keep trying
      }
      // An event that is still going keeps moving; a finished one never changes.
      if (ongoing && !ac.signal.aborted) timer = setTimeout(load, REFRESH_MS)
    }
    void load()
    return () => {
      ac.abort()
      clearTimeout(timer)
    }
  }, [id, reload])

  const loaded = data?.event.id === id ? data : null
  const series = useMemo(
    () => (loaded ? buildSeries(loaded.readings, loaded.event.trace, tempUnit) : null),
    [loaded, tempUnit],
  )

  if (!loaded && error === 'missing') {
    return (
      <PageState>
        <p className="text-sm text-zinc-300">This event is no longer in the log.</p>
        <Link href="/events" className={btnCls}>All events</Link>
      </PageState>
    )
  }
  if (!loaded && error === 'failed') {
    return (
      <PageState>
        <p className="text-sm text-zinc-300">Could not load this event.</p>
        <button type="button" className={btnCls} onClick={() => setReload(n => n + 1)}>Try again</button>
      </PageState>
    )
  }
  if (!loaded) return <PageState><Spinner /></PageState>

  const { event, related } = loaded
  const trace = event.trace ?? null
  const ongoing = event.endTime === null
  const lead = leadMetric(event.type)
  const severity = SEVERITY_INFO[event.severity]
  const canDismiss = ongoing && isAlert(event.severity) && !event.acknowledged
  const start = event.startTime.getTime()
  const end = event.endTime?.getTime() ?? null

  function dismiss() {
    acknowledgeEvent(event.id)
    setData(d => (d ? { ...d, event: { ...d.event, acknowledged: true } } : d))
  }

  async function remove() {
    setDeleting('busy')
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(event.id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('failed')
      refreshEvents()
      router.push('/events')
    } catch {
      setDeleting('failed')
    }
  }

  // ── Lanes ──────────────────────────────────────────────────────────────────
  const metricLane = (m: EventMetric): Lane => {
    const status = metricStatus(m, event.peak[m])
    const L = SEVERITY_LIMITS
    return {
      key: m,
      label: METRIC_INFO[m].label,
      unit: METRIC_INFO[m].unit,
      values: series?.[m] ?? [],
      format: v => fmtMetric(m, v),
      headline: fmtMetric(m, event.peak[m]),
      note: `before ${fmtMetric(m, event.baseline[m])}`,
      status: status
        ? { word: STATUS_COLORS[status].label, hex: STATUS_COLORS[status].hex, good: status === 'good' }
        : { word: vocWord(event.peak[m]), hex: null },
      lead: m === lead,
      fromZero: m === 'pm02',
      lines: m !== lead ? undefined
        : m === 'pm02' ? [
            { value: L.pmSensitive, label: `Sensitive above ${Math.floor(L.pmSensitive)}`, hex: STATUS_COLORS.sensitive.hex },
            { value: L.pmWarning, label: `Unhealthy above ${Math.floor(L.pmWarning)}`, hex: STATUS_COLORS.unhealthy.hex },
            { value: L.pmCritical, label: `Very unhealthy above ${Math.floor(L.pmCritical)}`, hex: STATUS_COLORS['very-unhealthy'].hex },
          ]
        : m === 'rco2' ? [
            { value: L.co2Event, label: 'Stale above 1,000', hex: STATUS_COLORS.sensitive.hex },
            { value: L.co2Warning, label: 'Unhealthy above 1,500', hex: STATUS_COLORS.unhealthy.hex },
          ]
        : undefined,
    }
  }
  const lanes: Lane[] = [lead, ...EVENT_METRICS.filter(m => m !== lead)].map(metricLane)
  const contextLane = (key: 'temp' | 'hum' | 'pm01' | 'pm10', label: string, unit: string, format: (v: number) => string): Lane => ({
    key, label, unit, values: series?.[key] ?? [], format, note: rangeNote(series?.[key] ?? [], format),
  })
  const moreLanes: Lane[] = series?.source === 'readings' ? [
    contextLane('temp', 'Temperature', `°${tempUnit}`, one),
    contextLane('hum', 'Humidity', '%', v => Math.round(v).toString()),
    contextLane('pm01', 'PM1', 'µg/m³', one),
    contextLane('pm10', 'PM10', 'µg/m³', one),
  ] : []
  const from = series ? Math.min(series.ts[0], start - PAD_MS) : start - PAD_MS
  const to = series ? Math.max(series.ts[series.ts.length - 1], end ?? 0) : (end ?? start) + PAD_MS
  const laneProps = { ts: series?.ts ?? [], from, to, eventStart: start, eventEnd: end, markAt: trace?.peakAt[lead], bandHex: severity.barHex }

  // ── Facts ──────────────────────────────────────────────────────────────────
  const minutes = trace?.minutes
  const band =
    lead === 'pm02' && minutes
      ? minutes.pmVeryUnhealthy >= 1 ? { label: 'Very unhealthy for', min: minutes.pmVeryUnhealthy }
        : minutes.pmUnhealthy >= 1 ? { label: 'Unhealthy for', min: minutes.pmUnhealthy }
        : minutes.pmSensitive >= 1 ? { label: 'Above 35 µg/m³ for', min: minutes.pmSensitive }
        : null
      : lead === 'rco2' && minutes
        ? minutes.co2VeryHigh >= 1 ? { label: 'Above 2,000 ppm for', min: minutes.co2VeryHigh }
          : minutes.co2High >= 1 ? { label: 'Above 1,500 ppm for', min: minutes.co2High }
          : null
        : null

  const often = sameTimeDays(event, related.recent)
  const oftenCount = often.filter(Boolean).length
  const windowStart = Math.round((start - OFTEN_WINDOW_MIN * 60_000) / 3_600_000) * 3_600_000
  const windowEnd = windowStart + 2 * OFTEN_WINDOW_MIN * 60_000

  return (
    <Page>
      <PageHeader
        title={eventTitle(event.type)}
        back={{ href: '/events', label: 'Events' }}
        subtitle={(
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <SeverityLabel severity={event.severity} />
            <span className="tabular-nums">{whenLine(event)}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{fmtDuration(eventMinutes(event, nowMinute))}</span>
            {ongoing
              ? <><span aria-hidden="true">·</span><span className="font-medium text-emerald-400">Ongoing</span></>
              : <><span aria-hidden="true">·</span><span>Ended</span></>}
            {event.acknowledged && isAlert(event.severity) && <><span aria-hidden="true">·</span><span>Dismissed</span></>}
          </span>
        )}
      >
        <AnimatePresence initial={false}>
          {canDismiss && (
            <motion.button
              key="dismiss"
              type="button"
              onClick={dismiss}
              className={btnCls}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              Dismiss alert
            </motion.button>
          )}
        </AnimatePresence>
        {related.newerId
          ? <Link href={eventHref(related.newerId)} className={iconBtnCls} aria-label="Newer event" title="Newer event"><Icon d="M12.5 5l-5 5 5 5" /></Link>
          : <span className={`${iconBtnCls} opacity-40`} aria-hidden="true"><Icon d="M12.5 5l-5 5 5 5" /></span>}
        {related.olderId
          ? <Link href={eventHref(related.olderId)} className={iconBtnCls} aria-label="Older event" title="Older event"><Icon d="M7.5 5l5 5-5 5" /></Link>
          : <span className={`${iconBtnCls} opacity-40`} aria-hidden="true"><Icon d="M7.5 5l5 5-5 5" /></span>}
        {!ongoing && (
          <button type="button" className={iconBtnCls} aria-label="Delete event" title="Delete event" aria-haspopup="dialog" onClick={() => { setDeleting(null); setConfirmDelete(true) }}>
            <Icon d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6M8.5 9v5M11.5 9v5" />
          </button>
        )}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Readings on one clock */}
        <Card className="order-2 px-4 pb-4 pt-4 md:px-6 md:pt-5 lg:order-1">
          {series ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-1">
                <SectionTitle>Readings during the event</SectionTitle>
                <p className="text-xs text-zinc-400">
                  One time axis for all four{trace ? `. The line marks the ${METRIC_INFO[lead].short} peak.` : '.'}
                </p>
              </div>
              <EventLanes lanes={lanes} {...laneProps} />
              {series.source === 'trace' && (
                <p className="mt-3 border-t border-air-line pt-3 text-[13px] leading-relaxed text-zinc-400">
                  Readings are kept for 30 days. This is the outline that was saved with the event.
                </p>
              )}
              {moreLanes.length > 0 && (
                <div className="mt-3 border-t border-air-line">
                  <button
                    type="button"
                    aria-expanded={moreOpen}
                    onClick={() => setMoreOpen(o => !o)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg pt-1 text-left text-sm font-medium text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <span>More readings <span className="ml-2 font-normal text-zinc-400">Temperature, humidity, PM1, PM10</span></span>
                    <svg aria-hidden="true" className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7.5l5 5 5-5" /></svg>
                  </button>
                  <AnimatePresence initial={false}>
                    {moreOpen && (
                      <motion.div
                        key="more"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
                        className="overflow-hidden"
                      >
                        <EventLanes lanes={moreLanes} {...laneProps} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-zinc-300">No readings are stored for this event</p>
              <p className="mt-1 text-sm text-zinc-400">Readings are kept for 30 days, and this event has no saved outline.</p>
            </div>
          )}
        </Card>

        {/* What it was, what to do, the facts */}
        <div className="contents lg:order-2 lg:flex lg:flex-col lg:gap-4">
          <Card className="order-1 px-5 py-4">
            <p className="text-[15px] leading-relaxed text-zinc-200">{event.description}</p>
            {event.recommendation && (
              <p className="mt-2.5 text-sm leading-relaxed text-zinc-300"><span className="font-medium text-zinc-50">What to do.</span> {event.recommendation}</p>
            )}
            <p className="mt-2.5 text-sm leading-relaxed text-zinc-400"><span className="text-zinc-300">Likely causes.</span> {eventCauses(event.type)}</p>
          </Card>

          <Card className="order-3 px-5 py-1.5">
            <dl>
              <Fact label="Started">{fmtClock(event.startTime)}</Fact>
              {trace && <Fact label={`${METRIC_INFO[lead].short} peak`}>{fmtMetric(lead, event.peak[lead])} at {fmtClock(trace.peakAt[lead])}</Fact>}
              {event.sustained && <Fact label="Held for 3 minutes">{fmtMetricWithUnit(lead, event.sustained[lead])}</Fact>}
              {band && <Fact label={band.label}>{fmtDuration(band.min)}</Fact>}
              <Fact label={ongoing ? 'Still going' : 'Ended'}>{ongoing ? 'yes' : fmtClock(event.endTime!)}</Fact>
              <Fact label={ongoing ? 'So far' : 'Lasted'}>{fmtDuration(eventMinutes(event, nowMinute))}</Fact>
            </dl>
          </Card>

          {related.overlapping.length > 0 && (
            <section aria-label="At the same time" className={`${cardCls} order-4 overflow-hidden`}>
              <SectionTitle className="px-5 pb-2 pt-4">At the same time</SectionTitle>
              {related.overlapping.map(o => (
                <Link key={o.id} href={eventHref(o.id)} className="flex min-h-12 items-center gap-3 border-t border-air-line px-5 py-2 transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400">
                  <SeverityMark severity={o.severity} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-zinc-50">{eventTitle(o.type)}</span>
                    <span className="block text-[13px] tabular-nums text-zinc-400"><KeyNumbers event={o} max={1} /> · from {fmtClock(o.startTime)}</span>
                  </span>
                </Link>
              ))}
            </section>
          )}

          {oftenCount >= OFTEN_MIN_DAYS && (
            <Card className="order-5 px-5 py-4">
              <SectionTitle>This happens often</SectionTitle>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                An event started between {fmtHour(windowStart)} and {fmtHour(windowEnd)} on {oftenCount} of the {OFTEN_DAYS} days before this one.
              </p>
              <div role="img" aria-label={`The ${OFTEN_DAYS} days before, oldest first: ${oftenCount} had an event around this time`} className="mt-3 flex gap-1">
                {often.map((hit, i) => (
                  <span key={i} className={`h-4 flex-1 rounded ${hit ? 'bg-zinc-500' : 'border border-air-line bg-air-raised'}`} />
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <AnimatePresence>
        {confirmDelete && (
          <Modal onClose={() => setConfirmDelete(false)}>
            <div className="flex flex-col gap-3 p-5">
              <h2 className="text-base font-semibold text-zinc-50">Delete this event?</h2>
              <p className="text-sm leading-relaxed text-zinc-300">
                {eventTitle(event.type)}, {whenLine(event)}. It is removed from the log. Re-running detection brings it back if the stored readings still show it.
              </p>
              {deleting === 'failed' && <p role="alert" className="text-sm text-red-400">That did not work. Try again.</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className={btnCls} onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button
                  type="button"
                  disabled={deleting === 'busy'}
                  onClick={remove}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50"
                >
                  {deleting === 'busy' ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </Page>
  )
}
