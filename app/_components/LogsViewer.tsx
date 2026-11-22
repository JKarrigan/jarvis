'use client'

import { useEffect, useState } from 'react'
import { EmptyState, Page, PageHeader, btnCls, cardCls } from './air/ui'
import type { HttpLogEntry } from '@/lib/httpLog'

const SOURCE_STYLES: Record<HttpLogEntry['source'], string> = {
  'air-gradient': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'hue':          'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'outdoor-aqi':  'bg-blue-500/15 text-blue-400 border-blue-500/30',
}

const SOURCE_LABEL: Record<HttpLogEntry['source'], string> = {
  'air-gradient': 'Air Gradient',
  'hue':          'Hue',
  'outdoor-aqi':  'Outdoor AQI',
}

type Filter = 'all' | HttpLogEntry['source']

function statusClass(status: number | null): string {
  if (status === null) return 'text-zinc-400'
  if (status < 300) return 'text-emerald-400'
  if (status < 400) return 'text-blue-400'
  if (status < 500) return 'text-amber-400'
  return 'text-red-400'
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function tryPrettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function LogsViewer() {
  const [logs, setLogs] = useState<HttpLogEntry[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [paused, setPaused] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // Polls every 3 s while not paused and the tab is visible (refreshes on return).
  useEffect(() => {
    if (paused) return
    const ac = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      clearTimeout(timer)
      if (!document.hidden) {
        try {
          const r = await fetch('/api/logs', { signal: ac.signal })
          const data = r.ok ? await r.json() as HttpLogEntry[] : null
          if (Array.isArray(data)) setLogs(data)
        } catch { /* keep last logs */ }
      }
      if (!ac.signal.aborted) timer = setTimeout(tick, 3000)
    }
    const onVisible = () => { if (!document.hidden) void tick() }
    document.addEventListener('visibilitychange', onVisible)
    void tick()
    return () => {
      ac.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [paused])

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visible = filter === 'all' ? logs : logs.filter(e => e.source === filter)

  return (
    <Page>
      <PageHeader title="Logs" subtitle={`Outbound HTTP requests made by the server. ${visible.length} shown.`}>
        <div role="group" aria-label="Source" className="inline-flex flex-wrap gap-1 rounded-xl bg-air-raised p-1">
          {(['all', 'air-gradient', 'hue', 'outdoor-aqi'] as Filter[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`min-h-8 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                filter === f ? 'bg-air-active font-semibold text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {f === 'all' ? 'All' : SOURCE_LABEL[f as HttpLogEntry['source']]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPaused(p => !p)}
          aria-pressed={paused}
          className={paused ? `${btnCls} border-amber-500/40 bg-amber-500/10 text-amber-200` : btnCls}
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${paused ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          {paused ? 'Paused' : 'Live'}
        </button>
      </PageHeader>

        {visible.length === 0 ? (
          <EmptyState title="No requests logged yet" hint="Entries appear as the server calls the sensor, the Hue bridge and the outdoor air service." />
        ) : (
          <div className={`${cardCls} overflow-x-auto`}>
            <div className="min-w-[720px]">
            <div className="grid grid-cols-[80px_100px_48px_1fr_56px_64px_20px] gap-x-3 border-b border-air-line px-4 py-3 text-[13px] font-medium text-zinc-400 md:px-5">
              <span>Time</span>
              <span>Source</span>
              <span>Method</span>
              <span>URL</span>
              <span>Status</span>
              <span className="text-right">Duration</span>
              <span />
            </div>
            <div className="divide-y divide-air-line">
              {visible.map(entry => {
                const isOpen = expanded.has(entry.id)
                const hasData = !!entry.data
                return (
                  <div key={entry.id}>
                    <div
                      onClick={() => hasData && toggleExpand(entry.id)}
                      className={`grid grid-cols-[80px_100px_48px_1fr_56px_64px_20px] gap-x-3 px-4 py-2.5 items-start text-xs font-mono transition-colors md:px-5 ${hasData ? 'cursor-pointer hover:bg-white/[0.04]' : ''}`}
                    >
                      <span className="text-zinc-400 tabular-nums">{fmtTime(entry.ts)}</span>
                      <span>
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-sans font-semibold ${SOURCE_STYLES[entry.source]}`}>
                          {SOURCE_LABEL[entry.source]}
                        </span>
                      </span>
                      <span className="text-zinc-400">{entry.method}</span>
                      <span className="text-zinc-300 break-all leading-relaxed min-w-0">
                        {entry.url}
                        {entry.error && (
                          <span className="block text-red-400 text-[10px] mt-0.5 font-sans">{entry.error}</span>
                        )}
                      </span>
                      <span className={`tabular-nums ${statusClass(entry.status)}`}>
                        {entry.status ?? '—'}
                      </span>
                      <span className="text-zinc-400 tabular-nums text-right">{fmtMs(entry.durationMs)}</span>
                      <span className="flex items-center justify-center text-zinc-400">
                        {hasData && (
                          <svg
                            className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                            viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                          >
                            <polyline points="4 2 8 6 4 10" />
                          </svg>
                        )}
                      </span>
                    </div>

                    {isOpen && entry.data && (
                      <div className="border-t border-air-line bg-air-raised px-4 pb-3 pt-2 md:px-5">
                        <pre className="text-[11px] font-mono text-zinc-400 whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">
                          {tryPrettyJson(entry.data)}
                        </pre>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            </div>
          </div>
        )}
    </Page>
  )
}
