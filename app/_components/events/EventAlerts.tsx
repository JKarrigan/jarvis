'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import type { AirQualityEvent } from '@/lib/eventTypes'
import { METRIC_INFO, SEVERITY_INFO, eventTitle, fmtMetricWithUnit, leadMetric } from '@/lib/eventInfo'
import { usePolling } from '../PollingProvider'
import { SeverityMark, eventHref } from './EventBits'

/** Alert keys (id:severity) already announced, so a reload doesn't announce them again (bounded). */
const NOTIFIED_KEY = 'aq-notified'
const NOTIFIED_MAX = 50
/** A warning toast leaves by itself; a critical one stays until closed. */
const WARNING_MS = 12_000
/** Pages that show the banner for the same alert: no toast on top of it. */
const BANNER_PAGES = new Set(['/', '/air-quality'])

function readNotified(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeNotified(keys: string[]): void {
  try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(keys.slice(-NOTIFIED_MAX))) } catch { /* private mode */ }
}

const alertKey = (e: AirQualityEvent) => `${e.id}:${e.severity}`

/** One toast. A warning closes itself after a while; the timer belongs to the toast, so polling never resets it. */
function AlertToast({ event, onClose }: { event: AirQualityEvent; onClose: () => void }) {
  const lead = leadMetric(event.type)
  const hex = SEVERITY_INFO[event.severity].hex
  const critical = event.severity === 'critical'
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    if (critical) return
    const timer = setTimeout(() => close.current(), WARNING_MS)
    return () => clearTimeout(timer)
  }, [critical])

  return (
    <motion.div
      layout
      role={critical ? 'alert' : 'status'}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
      className="pointer-events-auto flex w-full items-center gap-3 rounded-xl border bg-air-raised py-2 pl-3.5 pr-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:w-auto sm:min-w-[280px]"
      style={{ borderColor: `${hex}59` }}
    >
      <SeverityMark severity={event.severity} />
      <span className="min-w-0 flex-1">
        <span className="sr-only">{SEVERITY_INFO[event.severity].label}: </span>
        <span className="block text-sm font-medium text-zinc-50">{eventTitle(event.type)}</span>
        <span className="block text-[13px] tabular-nums text-zinc-400">
          {METRIC_INFO[lead].label} peaked at {fmtMetricWithUnit(lead, event.peak[lead])}
        </span>
      </span>
      <Link href={eventHref(event.id)} onClick={onClose} className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400" style={{ color: hex }}>
        View
      </Link>
      <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
        <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
      </button>
    </motion.div>
  )
}

/**
 * Toasts for new warnings and criticals on every Home page (mounted in the
 * (air) layout): top of the screen on a phone, where the tab bar is not;
 * bottom right from `sm`. An alert is announced once per id and severity: an
 * event keeps its id when it gets worse, and that should be announced again.
 */
export function EventAlerts() {
  const { alerts } = usePolling()
  const pathname = usePathname()
  const seen = useRef<Set<string> | null>(null)
  const [shown, setShown] = useState<string[]>([])

  useEffect(() => {
    seen.current ??= new Set(readNotified())
    const fresh = alerts.filter(e => !seen.current!.has(alertKey(e)))
    if (fresh.length === 0) return
    for (const e of fresh) seen.current.add(alertKey(e))
    writeNotified([...seen.current])
    // The banner pages and the event's own page already show it.
    const toToast = fresh.filter(e => !BANNER_PAGES.has(pathname) && pathname !== eventHref(e.id)).map(alertKey)
    if (toToast.length > 0) setShown(prev => [...prev, ...toToast])
  }, [alerts, pathname])

  // Only alerts that are still open and not dismissed stay up.
  const visible = alerts.filter(e => shown.includes(alertKey(e)))

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-3 top-3 z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto">
      <AnimatePresence>
        {visible.map(event => (
          <AlertToast
            key={alertKey(event)}
            event={event}
            onClose={() => setShown(prev => prev.filter(k => k !== alertKey(event)))}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
