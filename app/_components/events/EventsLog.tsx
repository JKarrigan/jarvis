'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import type { AirQualityEvent } from '@/lib/eventTypes'
import { KIND_INFO, KIND_ORDER, SEVERITY_INFO, eventKind, eventTitle, isAlert, type EventKind } from '@/lib/eventInfo'
import { useNowMinute } from '@/lib/useNow'
import { reviveEvent } from '../PollingProvider'
import { EmptyState, Page, PageHeader, PageState, Segmented, btnCls, cardCls } from '../air/ui'
import { EASE, FadeIn, LoadingMark } from '../air/motion'
import { DayTrack, EventRow, HourAxis, SeverityMark, addDays, fmtDay, relativeDay, startOfDay } from './EventBits'
import { DetectionGuide } from './DetectionGuide'

const RANGES = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
] as const
type RangeKey = typeof RANGES[number]['key']

const REFRESH_MS = 60_000

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined
}

const chipCls = (on: boolean) =>
  `inline-flex min-h-9 items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
    on ? 'border-transparent bg-air-active font-semibold text-white' : 'border-air-line text-zinc-400 hover:text-white'
  }`

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** "Nothing is happening right now." or what is. */
function nowLine(open: AirQualityEvent[]): string {
  if (open.length === 0) return 'Nothing is happening right now.'
  if (open.length === 1) return `${eventTitle(open[0].type)} is going on now.`
  return `${open.length} events are going on now.`
}

function rangeLine(events: AirQualityEvent[], label: string): string {
  if (events.length === 0) return `No events in the last ${label}.`
  const warnings = events.filter(e => e.severity === 'warning').length
  const critical = events.filter(e => e.severity === 'critical').length
  const parts = [warnings ? plural(warnings, 'warning') : null, critical ? `${critical} critical` : null].filter(Boolean)
  return `${plural(events.length, 'event')} in the last ${label}${parts.length ? `: ${parts.join(', ')}.` : ', none above notable.'}`
}

interface Day {
  start: number
  /** Events drawn on the day's track (anything overlapping it). */
  onTrack: AirQualityEvent[]
  /** Events listed under the day (the ones that started on it), newest first. */
  listed: AirQualityEvent[]
}

/**
 * The events log as a ledger of days: each day is one midnight-to-midnight
 * track with its events underneath, so the time of day lines up down the page
 * and a daily pattern is visible at a glance. Range and filters live in the
 * URL, so Back from an event returns to the same view.
 */
export function EventsLog() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const range: RangeKey = oneOf(searchParams.get('range'), RANGES.map(r => r.key)) ?? '7d'
  const alertsOnly = searchParams.get('show') === 'alerts'
  const kind = oneOf(searchParams.get('kind'), KIND_ORDER)
  const rangeInfo = RANGES.find(r => r.key === range)!

  // A fresh state object every time: handing history.state back makes Next skip its useSearchParams sync.
  const setQuery = useCallback((next: { range?: RangeKey; alertsOnly?: boolean; kind?: EventKind | null }) => {
    const q = new URLSearchParams()
    const r = next.range ?? range
    const a = next.alertsOnly ?? alertsOnly
    const k = next.kind === undefined ? kind : next.kind
    if (r !== '7d') q.set('range', r)
    if (a) q.set('show', 'alerts')
    if (k) q.set('kind', k)
    const qs = q.toString()
    window.history.replaceState({}, '', `${pathname}${qs ? `?${qs}` : ''}`)
  }, [pathname, range, alertsOnly, kind])

  const nowMinute = useNowMinute()
  const [data, setData] = useState<{ range: RangeKey; events: AirQualityEvent[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const [guideOpen, setGuideOpen] = useState(false)
  /** Days the user opened or closed by hand; the rest follow the default. */
  const [toggled, setToggled] = useState<Record<number, boolean>>({})

  useEffect(() => {
    const ac = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      if (!document.hidden) {
        const since = addDays(startOfDay(Date.now()), -(rangeInfo.days - 1))
        try {
          const res = await fetch(`/api/events?since=${since}&limit=1000`, { signal: ac.signal })
          if (!res.ok) throw new Error('failed')
          const rows = await res.json() as Parameters<typeof reviveEvent>[0][]
          setData({ range, events: rows.map(reviveEvent) })
          setFailed(false)
        } catch {
          if (ac.signal.aborted) return
          setFailed(true)
        }
      }
      timer = setTimeout(load, REFRESH_MS)
    }
    void load()
    return () => {
      ac.abort()
      clearTimeout(timer)
    }
  }, [range, rangeInfo.days, reload])

  const events = data?.events
  // The ledger is drawn for the range of the events on screen: while the next range
  // loads, the last one keeps its days, spacing and open days.
  const shownRange: RangeKey = data?.range ?? range
  const shownDays = RANGES.find(r => r.key === shownRange)!.days
  const filtered = useMemo(
    () => (events ?? []).filter(e => (!alertsOnly || isAlert(e.severity)) && (!kind || eventKind(e.type) === kind)),
    [events, alertsOnly, kind],
  )
  const kinds = useMemo(() => {
    const present = new Set((events ?? []).map(e => eventKind(e.type)))
    return KIND_ORDER.filter(k => present.has(k) || k === kind)
  }, [events, kind])

  const days = useMemo<Day[]>(() => {
    if (nowMinute == null) return []
    const today = startOfDay(nowMinute)
    const out: Day[] = []
    for (let i = 0; i < shownDays; i++) {
      const start = addDays(today, -i)
      const end = addDays(start, 1)
      out.push({
        start,
        onTrack: filtered.filter(e => e.startTime.getTime() < end && (e.endTime?.getTime() ?? nowMinute) >= start),
        listed: filtered.filter(e => e.startTime.getTime() >= start && e.startTime.getTime() < end),
      })
    }
    return out
  }, [filtered, nowMinute, shownDays])

  // In the week view the two most recent days with events start open; longer ranges start as tracks only.
  const openByDefault = useMemo(() => {
    if (shownRange !== '7d') return new Set<number>()
    return new Set(days.filter(d => d.listed.length > 0).slice(0, 2).map(d => d.start))
  }, [days, shownRange])
  const isOpen = (day: Day) => day.listed.length > 0 && (toggled[day.start] ?? openByDefault.has(day.start))

  if (!data && failed) {
    return (
      <FadeIn key="failed">
        <PageState>
          <p className="text-sm text-zinc-300">Could not load the events.</p>
          <button type="button" className={btnCls} onClick={() => setReload(n => n + 1)}>Try again</button>
        </PageState>
        </FadeIn>
      )
    }
    if (!data || nowMinute == null) return <EventsLogSkeleton />

    const open = data.events.filter(e => e.endTime === null)
    const switching = data.range !== range
    const filtering = alertsOnly || !!kind
    // The sentence describes the events on screen, so while the next range loads it keeps the last one's label.
    const shownLabel = RANGES.find(r => r.key === shownRange)!.label
    const listState = data.events.length === 0 ? 'none' : filtered.length === 0 ? 'no-match' : 'ledger'

    return (
      <FadeIn key="ready">
        <Page>
          <PageHeader
            title="Events"
            subtitle={<>{nowLine(open)} {rangeLine(data.events, shownLabel)}</>}
          >
            <LoadingMark loading={switching} />
            <Segmented options={RANGES} value={range} onChange={key => setQuery({ range: key })} label="Range" />
            <button type="button" className={btnCls} onClick={() => setGuideOpen(true)} aria-haspopup="dialog">How detection works</button>
          </PageHeader>

          <AnimatePresence initial={false}>
            {data.events.length > 0 && (
              <motion.div
                key="filters"
                initial={{ height: 0, opacity: 0, marginBottom: -16 }}
                animate={{ height: 'auto', opacity: 1, marginBottom: 0 }}
                exit={{ height: 0, opacity: 0, marginBottom: -16 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="-mx-4 overflow-hidden md:mx-0"
              >
                <div role="group" aria-label="Filter events" className="flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden">
                  <button type="button" aria-pressed={!alertsOnly} className={chipCls(!alertsOnly)} onClick={() => setQuery({ alertsOnly: false })}>All</button>
                  <button type="button" aria-pressed={alertsOnly} className={chipCls(alertsOnly)} onClick={() => setQuery({ alertsOnly: true })}>Warnings and critical</button>
                  <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-white/10" />
                  {kinds.map(k => (
                    <button key={k} type="button" aria-pressed={kind === k} className={chipCls(kind === k)} onClick={() => setQuery({ kind: kind === k ? null : k })}>
                      {KIND_INFO[k].chip}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Each state fades in when it replaces another; a range switch with events in both keeps the ledger. */}
          <FadeIn key={listState}>
            {listState === 'none' ? (
              <EmptyState title={`No events in the last ${shownLabel}`} hint="Nothing unusual was detected. Try a longer range." />
            ) : listState === 'no-match' ? (
              <EmptyState title="Nothing matches these filters">
                <button type="button" className={`${btnCls} mt-3`} onClick={() => setQuery({ alertsOnly: false, kind: null })}>Show all events</button>
              </EmptyState>
            ) : (
              <section aria-label="Events by day" className={`${cardCls} overflow-hidden transition-opacity ${switching ? 'opacity-60' : ''}`}>
                {/* Hour axis, aligned with every day's track (desktop; phones label the first track instead). */}
                <div className="hidden items-center gap-4 px-5 pb-1 pt-3.5 sm:flex">
                  <span className="w-[116px] shrink-0" />
                  <HourAxis className="min-w-0 flex-1" />
                  <span className="w-[92px] shrink-0" />
                </div>
                {days.map((day, i) => {
                  const openDay = isOpen(day)
                  const alerts = day.listed.filter(e => isAlert(e.severity))
                  const worst = alerts.some(e => e.severity === 'critical') ? 'critical' : 'warning'
                  const count = day.listed.length
                  const rel = relativeDay(day.start, nowMinute)
                  const expandable = count > 0
                  const Header = expandable ? 'button' : 'div'
                  return (
                    <div key={day.start} className={i > 0 ? 'border-t border-air-line' : ''}>
                      <Header
                        {...(expandable ? {
                          type: 'button' as const,
                          'aria-expanded': openDay,
                          onClick: () => setToggled(t => ({ ...t, [day.start]: !openDay })),
                        } : {})}
                        className={`block w-full px-4 text-left sm:flex sm:items-center sm:gap-4 md:px-5 ${shownRange === '7d' ? 'py-2.5' : 'py-1.5'} ${
                          expandable ? 'transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400' : ''
                        }`}
                      >
                        <span className="flex items-baseline justify-between gap-3 sm:block sm:w-[116px] sm:shrink-0">
                          <span className="flex flex-wrap items-baseline gap-x-2 sm:block">
                            <span className={`text-sm font-medium ${count > 0 ? 'text-zinc-50' : 'text-zinc-400'}`}>{fmtDay(day.start)}</span>
                            {rel && <span className="text-xs text-zinc-400 sm:block">{rel}</span>}
                            {alerts.length > 0 && (
                              <span className={`inline-flex items-center gap-1.5 text-xs font-medium sm:flex ${SEVERITY_INFO[worst].textClass}`}>
                                <SeverityMark severity={worst} size={8} />
                                {alerts.length === 1 ? `1 ${SEVERITY_INFO[alerts[0].severity].label.toLowerCase()}` : `${alerts.length} alerts`}
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-zinc-400 sm:hidden">{count > 0 ? plural(count, 'event') : 'No events'}</span>
                        </span>
                        <span className="mt-2 block min-w-0 flex-1 sm:mt-0">
                          <DayTrack dayStart={day.start} events={day.onTrack} now={nowMinute} />
                          {i === 0 && <HourAxis compact className="mt-1 sm:hidden" />}
                        </span>
                        <span className="hidden w-[92px] shrink-0 items-center justify-end gap-1.5 text-[13px] text-zinc-400 sm:flex">
                          {count > 0 ? plural(count, 'event') : 'No events'}
                          {expandable && (
                            <svg aria-hidden="true" className={`h-3.5 w-3.5 transition-transform duration-200 ${openDay ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 7.5l5 5 5-5" />
                            </svg>
                          )}
                        </span>
                      </Header>
                      <AnimatePresence initial={false}>
                        {openDay && (
                          <motion.div
                            key="rows"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
                            className="overflow-hidden"
                          >
                            {day.listed.map(event => (
                              <EventRow key={event.id} event={event} now={nowMinute} className="border-t border-air-line" />
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </section>
            )}
        </FadeIn>

        {filtered.length > 0 && (
          <p className="text-[13px] leading-relaxed text-zinc-400">
            Each day runs from midnight to midnight. {filtering ? `Showing ${filtered.length} of ${plural(data.events.length, 'event')}. ` : ''}
            Events are kept for 90 days, the readings behind them for 30.
          </p>
        )}

        <AnimatePresence>
          {guideOpen && <DetectionGuide onClose={() => setGuideOpen(false)} onReprocessed={() => setReload(n => n + 1)} />}
        </AnimatePresence>
      </Page>
    </FadeIn>
  )
}

/**
 * The log's shape before its first data (also the page's Suspense fallback): the
 * header, the filter row and a week of empty day tracks, so the ledger fades in
 * where it will stay.
 */
export function EventsLogSkeleton() {
  const bar = 'animate-pulse rounded bg-air-raised'
  return (
    <Page>
      <PageHeader
        title="Events"
        // The real sentence usually wraps to two lines on phones.
        subtitle={(
          <span className="flex flex-col">
            <span className="flex h-5 items-center"><span className={`h-3.5 w-72 max-w-full ${bar}`} /></span>
            <span className="flex h-5 items-center sm:hidden"><span className={`h-3.5 w-36 ${bar}`} /></span>
          </span>
        )}
      >
        <LoadingMark loading />
        <Segmented options={RANGES} value="7d" onChange={() => {}} label="Range" disabled />
        <button type="button" className={btnCls} disabled>How detection works</button>
      </PageHeader>
      <div aria-hidden="true" className="flex gap-2 pb-1">
        {[56, 168, 96, 112].map((w, i) => <span key={i} className={`h-9 shrink-0 rounded-full ${bar}`} style={{ width: w }} />)}
      </div>
      <section aria-busy="true" aria-label="Loading events" className={`${cardCls} overflow-hidden`}>
        <div className="hidden items-center gap-4 px-5 pb-1 pt-3.5 sm:flex">
          <span className="w-[116px] shrink-0" />
          <HourAxis className="min-w-0 flex-1" />
          <span className="w-[92px] shrink-0" />
        </div>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={`px-4 py-2.5 sm:flex sm:items-center sm:gap-4 md:px-5 ${i > 0 ? 'border-t border-air-line' : ''}`}>
            <span className="flex flex-col gap-1.5 sm:w-[116px] sm:shrink-0">
              <span className={`h-4 w-20 ${bar}`} />
              <span className={`h-3 w-12 ${bar}`} />
            </span>
            <span className="mt-2 block min-w-0 flex-1 sm:mt-0">
              <span className="block h-5 rounded-md bg-air-raised" />
            </span>
            <span className="hidden w-[92px] shrink-0 sm:block" />
          </div>
        ))}
      </section>
    </Page>
  )
}
