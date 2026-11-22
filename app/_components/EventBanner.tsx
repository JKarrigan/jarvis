'use client'

import { useState } from 'react'
import type { AirQualityEvent } from '@/lib/eventTypes'

interface EventBannerProps {
  events: AirQualityEvent[]
  onAcknowledge: (id: string) => void
}

export function EventBanner({ events, onAcknowledge }: EventBannerProps) {
  const [index, setIndex] = useState(0)

  const unacked = events.filter(e => !e.acknowledged)
  if (unacked.length === 0) return null

  const safeIndex = Math.min(index, unacked.length - 1)
  const event = unacked[safeIndex]

  function prev() { setIndex(i => Math.max(0, i - 1)) }
  function next() { setIndex(i => Math.min(unacked.length - 1, i + 1)) }

  return (
    <div className="flex w-full flex-wrap items-start gap-3 rounded-2xl border border-red-500/40 bg-red-950/30 px-4 py-3.5 md:px-5">
      <div className="mt-0.5 shrink-0 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-red-300">{event.title}</span>
          <span className="text-sm text-red-300/90 tabular-nums">
            {event.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {event.endTime ? ` – ${event.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' (ongoing)'}
          </span>
        </div>
        <p className="mt-0.5 text-sm leading-relaxed text-zinc-300">{event.description}</p>
        {event.recommendation && (
          <p className="mt-1 text-sm text-red-200">{event.recommendation}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {unacked.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={prev}
              disabled={safeIndex === 0}
              className="grid h-9 w-9 place-items-center rounded-lg text-base text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-30"
              aria-label="Previous alert"
            >
              ‹
            </button>
            <span className="text-xs text-zinc-400">{safeIndex + 1}/{unacked.length}</span>
            <button
              onClick={next}
              disabled={safeIndex === unacked.length - 1}
              className="grid h-9 w-9 place-items-center rounded-lg text-base text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-30"
              aria-label="Next alert"
            >
              ›
            </button>
          </div>
        )}
        <button
          onClick={() => onAcknowledge(event.id)}
          className="min-h-9 rounded-lg border border-red-500/40 bg-red-900/40 px-3 text-sm font-medium text-red-200 transition-colors hover:bg-red-900/70"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
