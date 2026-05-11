'use client'

import { useEffect, useState } from 'react'
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
  if (status === null) return 'text-zinc-500'
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

  function load() {
    fetch('/api/logs')
      .then(r => r.ok ? r.json() : [])
      .then((data: HttpLogEntry[]) => setLogs(data))
      .catch(() => {})
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (paused) return
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
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
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-lg font-semibold text-zinc-100">HTTP Activity</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {(['all', 'air-gradient', 'hue', 'outdoor-aqi'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  filter === f
                    ? 'bg-zinc-700 border-zinc-600 text-zinc-100'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {f === 'all' ? 'All' : SOURCE_LABEL[f as HttpLogEntry['source']]}
              </button>
            ))}
            <span className="text-zinc-800">|</span>
            <button
              onClick={() => setPaused(p => !p)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                paused
                  ? 'border-amber-700/60 bg-amber-900/20 text-amber-400'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              {paused ? 'Paused' : 'Live'}
            </button>
            <span className="text-xs text-zinc-700">{visible.length} entries</span>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center">
            <p className="text-sm text-zinc-500">No requests logged yet.</p>
            <p className="text-xs text-zinc-700 mt-1">Logs appear as the server makes outbound HTTP calls.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="grid grid-cols-[80px_100px_48px_1fr_56px_64px_20px] gap-x-3 px-4 py-2 border-b border-zinc-800 text-xs font-semibold uppercase tracking-widest text-zinc-600">
              <span>Time</span>
              <span>Source</span>
              <span>Method</span>
              <span>URL</span>
              <span>Status</span>
              <span className="text-right">Duration</span>
              <span />
            </div>
            <div className="divide-y divide-zinc-800/50">
              {visible.map(entry => {
                const isOpen = expanded.has(entry.id)
                const hasData = !!entry.data
                return (
                  <div key={entry.id}>
                    <div
                      onClick={() => hasData && toggleExpand(entry.id)}
                      className={`grid grid-cols-[80px_100px_48px_1fr_56px_64px_20px] gap-x-3 px-4 py-2 items-start text-xs font-mono transition-colors ${hasData ? 'cursor-pointer hover:bg-zinc-800/40' : 'hover:bg-zinc-800/20'}`}
                    >
                      <span className="text-zinc-600 tabular-nums">{fmtTime(entry.ts)}</span>
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
                      <span className="text-zinc-500 tabular-nums text-right">{fmtMs(entry.durationMs)}</span>
                      <span className="flex items-center justify-center text-zinc-700">
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
                      <div className="px-4 pb-3 pt-1 bg-zinc-900/60 border-t border-zinc-800/60">
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
        )}
      </div>
    </div>
  )
}
