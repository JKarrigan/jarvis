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
    <div className="w-full rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 flex items-start gap-3">
      <div className="mt-0.5 shrink-0 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-red-300">{event.title}</span>
          <span className="text-xs text-red-500/70 font-mono">
            {event.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {event.endTime ? ` – ${event.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' (ongoing)'}
          </span>
        </div>
        <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{event.description}</p>
        {event.recommendation && (
          <p className="text-xs text-red-300/80 mt-1">{event.recommendation}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {unacked.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={prev}
              disabled={safeIndex === 0}
              className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30 px-1 text-xs"
              aria-label="Previous alert"
            >
              ‹
            </button>
            <span className="text-xs text-zinc-600">{safeIndex + 1}/{unacked.length}</span>
            <button
              onClick={next}
              disabled={safeIndex === unacked.length - 1}
              className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30 px-1 text-xs"
              aria-label="Next alert"
            >
              ›
            </button>
          </div>
        )}
        <button
          onClick={() => onAcknowledge(event.id)}
          className="text-xs px-2.5 py-1 rounded-md bg-red-900/40 border border-red-500/30 text-red-300 hover:bg-red-900/60 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
