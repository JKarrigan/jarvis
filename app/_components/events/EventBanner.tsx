'use client'

import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import type { AirQualityEvent } from '@/lib/eventTypes'
import type { DeviceMeasures } from '@/lib/types'
import {
  METRIC_INFO, SEVERITY_INFO, SEVERITY_RANK, eventMinutes, eventTitle, fmtDuration, fmtMetricWithUnit, leadMetric, metricStatus,
} from '@/lib/eventInfo'
import { STATUS_COLORS } from '@/lib/statusColors'
import { STALE_AFTER_MS, useIsOlderThan, useNowMinute } from '@/lib/useNow'
import { usePolling } from '../PollingProvider'
import { btnCls } from '../air/ui'
import { SeverityMark, eventHref, fmtClock } from './EventBits'

/** "PM2.5 is 96 µg/m³ now, unhealthy." from the latest reading; the peak when there is none. */
function liveLine(event: AirQualityEvent, measures: DeviceMeasures | null): string {
  const lead = leadMetric(event.type)
  const label = METRIC_INFO[lead].label
  const current = measures?.[lead]
  if (typeof current !== 'number' || !Number.isFinite(current)) return `${label} peaked at ${fmtMetricWithUnit(lead, event.peak[lead])}.`
  const status = metricStatus(lead, current)
  return `${label} is ${fmtMetricWithUnit(lead, current)} now${status ? `, ${STATUS_COLORS[status].label.toLowerCase()}` : ''}.`
}

/**
 * One banner per open warning or critical event nobody has dismissed, worst
 * first. Sits at the top of Overview and Air quality; Dismiss silences the
 * alert everywhere (banner, toast, sidebar badge) until it gets worse.
 * The negative margin while collapsed cancels the page's flex gap, so the
 * layout does not jump when a banner comes or goes.
 */
export function EventBanner() {
  const { alerts, measures, lastUpdated, acknowledgeEvent } = usePolling()
  const now = useNowMinute()
  // An old reading is not "now": fall back to the peak.
  const stale = useIsOlderThan(lastUpdated?.getTime() ?? null, STALE_AFTER_MS)
  const live = stale ? null : measures
  const sorted = [...alerts].sort((a, b) =>
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.startTime.getTime() - a.startTime.getTime())

  return (
    <AnimatePresence initial={false}>
      {sorted.map(event => {
        const hex = SEVERITY_INFO[event.severity].hex
        const advice = event.recommendation?.split('. ')[0]
        return (
          <motion.div
            key={event.id}
            initial={{ height: 0, opacity: 0, marginTop: -16 }}
            animate={{ height: 'auto', opacity: 1, marginTop: 0 }}
            exit={{ height: 0, opacity: 0, marginTop: -16 }}
            transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div
              role={event.severity === 'critical' ? 'alert' : 'status'}
              className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-2xl border px-4 py-3 md:px-5"
              style={{ borderColor: `${hex}59`, backgroundColor: `${hex}14` }}
            >
              <SeverityMark severity={event.severity} size={12} />
              <div className="min-w-0 flex-1 basis-[240px]">
                <p className="text-sm">
                  <span className="sr-only">{SEVERITY_INFO[event.severity].label}: </span>
                  <span className="font-semibold text-zinc-50">{eventTitle(event.type)}</span>
                  <span className="ml-2.5 tabular-nums text-zinc-300">
                    since {fmtClock(event.startTime)}, {fmtDuration(eventMinutes(event, now))}
                  </span>
                </p>
                <p className="mt-0.5 text-sm tabular-nums text-zinc-200">
                  {liveLine(event, live)}{advice ? ` ${advice}${advice.endsWith('.') ? '' : '.'}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href={eventHref(event.id)} className={btnCls}>Details</Link>
                <button type="button" className={btnCls} onClick={() => acknowledgeEvent(event.id)}>Dismiss</button>
              </div>
            </div>
          </motion.div>
        )
      })}
    </AnimatePresence>
  )
}
