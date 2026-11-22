'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { KIND_INFO, KIND_ORDER, SEVERITY_INFO } from '@/lib/eventInfo'
import type { Severity } from '@/lib/eventTypes'
import { CloseButton, Sheet } from '../lights/dialog'
import { Spinner, btnCls } from '../air/ui'
import { SeverityMark } from './EventBits'

const SEVERITIES: Severity[] = ['notable', 'warning', 'critical']

interface ReprocessResult { readingsProcessed: number; eventsFound: number }

/**
 * "How detection works": what counts as an event, what each severity does,
 * and the one maintenance action (re-running detection over stored readings).
 */
export function DetectionGuide({ onClose, onReprocessed }: { onClose: () => void; onReprocessed: () => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ReprocessResult | 'failed' | null>(null)

  async function reprocess() {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/events/reprocess', { method: 'POST' })
      if (!res.ok) throw new Error('failed')
      setResult(await res.json() as ReprocessResult)
      onReprocessed()
    } catch {
      setResult('failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet onClose={onClose} wide>
      <div className="flex flex-col gap-5 px-5 pb-6 pt-4 sm:pt-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-zinc-50">How detection works</h2>
          <CloseButton onClick={onClose} />
        </div>

        <p className="text-sm leading-relaxed text-zinc-300">
          The sensor is read every 10 seconds. An event starts when one of the patterns below holds for 3 minutes
          (30 for CO₂) and ends once it has been gone for 5. If it comes back within 15 minutes it is the same event.
          One incident is one event, named for what was measured, not for a guessed cause.
        </p>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">Severity is how bad the air got</h3>
          {SEVERITIES.map(s => (
            <div key={s} className="flex items-baseline gap-2.5 text-sm">
              <SeverityMark severity={s} className="translate-y-px" />
              <span className={`w-16 shrink-0 font-medium ${SEVERITY_INFO[s].textClass}`}>{SEVERITY_INFO[s].label}</span>
              <span className="text-zinc-400">{SEVERITY_INFO[s].effect}</span>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-zinc-100">What counts as an event</h3>
          {KIND_ORDER.map(k => {
            const info = KIND_INFO[k]
            return (
              <div key={k} className="rounded-xl border border-air-line bg-air-raised px-4 py-3 text-[13px] leading-relaxed">
                <p className="text-sm font-medium text-zinc-100">{info.title}</p>
                <p className="mt-0.5 text-zinc-300">{info.signals}.</p>
                <p className="mt-1.5 text-zinc-400">{info.rule}</p>
                <p className="mt-1.5 text-zinc-400"><span className="text-zinc-300">Likely causes:</span> {info.causes}</p>
              </div>
            )
          })}
          <p className="text-[13px] leading-relaxed text-zinc-400">
            Stale air is tracked on its own, so it can overlap another event.
          </p>
        </section>

        <section className="flex flex-col gap-2 border-t border-air-line pt-4">
          <h3 className="text-sm font-semibold text-zinc-100">Re-run detection</h3>
          <p className="text-[13px] leading-relaxed text-zinc-400">
            Runs the current rules over the stored readings (about 30 days) and replaces the events in that span.
            Dismissals are kept. An event you deleted comes back if the readings still show it.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="button" onClick={reprocess} disabled={busy} className={btnCls}>
              {busy && <Spinner className="h-4 w-4" label="Working" />}
              {busy ? 'Working…' : 'Re-run detection'}
            </button>
            <AnimatePresence mode="wait" initial={false}>
              {result && (
                <motion.p
                  key={result === 'failed' ? 'failed' : 'done'}
                  role="status"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className={`text-[13px] ${result === 'failed' ? 'text-red-400' : 'text-zinc-300'}`}
                >
                  {result === 'failed'
                    ? 'That did not work. Try again.'
                    : `Found ${result.eventsFound} event${result.eventsFound === 1 ? '' : 's'} in ${result.readingsProcessed.toLocaleString()} readings.`}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>
    </Sheet>
  )
}
