'use client'

import { useEffect, useState } from 'react'

interface SystemStats {
  pi: {
    hostname: string
    platform: string
    arch: string
    osRelease: string
    uptime: number
    loadAvg: [number, number, number]
    cpu: { model: string; cores: number }
    memory: { total: number; free: number }
    disk: { total: string; used: string; available: string; usedPercent: string } | null
    cpuTemp: number | null
    dbFileSize: number | null
  }
  sensor: {
    serialno: string | null
    firmware: string | null
    model: string | null
    wifi: number | null
    bootCount: number | null
    boot: number | null
  } | null
  poller: { ip: string | null; error: string | null }
  db: { readingCount: number }
  app: { nodeVersion: string }
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0 || d > 0) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}

function tempColor(temp: number): string {
  if (temp < 60) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
  if (temp < 75) return 'text-amber-400 bg-amber-500/10 border-amber-500/30'
  return 'text-red-400 bg-red-500/10 border-red-500/30'
}

function BarRow({ label, value, max, display }: { label: string; value: number; max: number; display: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const barColor = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-300">{display}</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-xs py-1.5 border-b border-zinc-800/60 last:border-0">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className="text-zinc-300 text-right font-mono break-all">{value}</span>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      {children}
    </div>
  )
}

export function SystemViewer() {
  const [data, setData] = useState<SystemStats | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)

  function load() {
    fetch('/api/system')
      .then(r => r.ok ? r.json() : null)
      .then((d: SystemStats | null) => {
        if (d) {
          setData(d)
          setLastFetched(new Date())
        }
      })
      .catch(() => {})
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-zinc-100">System</h1>
          {lastFetched && (
            <span className="text-xs text-zinc-600">
              Updated {lastFetched.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        {!data ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center">
            <p className="text-sm text-zinc-500">Loading…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pi Hardware */}
            <Card title="Pi Hardware">
              <div className="flex items-center gap-2 pb-1">
                {data.pi.cpuTemp !== null ? (
                  <span className={`text-sm font-semibold px-2.5 py-1 rounded-lg border tabular-nums ${tempColor(data.pi.cpuTemp)}`}>
                    {data.pi.cpuTemp.toFixed(1)}°C
                  </span>
                ) : (
                  <span className="text-sm px-2.5 py-1 rounded-lg border border-zinc-800 text-zinc-600 bg-zinc-900">N/A</span>
                )}
                <span className="text-xs text-zinc-500">CPU temp</span>
              </div>

              <BarRow
                label="Memory"
                value={data.pi.memory.total - data.pi.memory.free}
                max={data.pi.memory.total}
                display={`${fmtBytes(data.pi.memory.total - data.pi.memory.free)} / ${fmtBytes(data.pi.memory.total)}`}
              />

              {data.pi.disk && (() => {
                const pct = parseInt(data.pi.disk.usedPercent)
                return (
                  <BarRow
                    label="Disk"
                    value={isNaN(pct) ? 0 : pct}
                    max={100}
                    display={`${data.pi.disk.used} / ${data.pi.disk.total}`}
                  />
                )
              })()}

              <div className="pt-1 divide-y divide-zinc-800/60">
                <Row label="CPU" value={`${data.pi.cpu.model} · ${data.pi.cpu.cores} cores`} />
                <Row label="Load avg" value={`${data.pi.loadAvg[0].toFixed(2)} · ${data.pi.loadAvg[1].toFixed(2)} · ${data.pi.loadAvg[2].toFixed(2)}`} />
                <Row label="Uptime" value={fmtUptime(data.pi.uptime)} />
                <Row label="OS" value={`${data.pi.hostname} · ${data.pi.platform} · ${data.pi.arch}`} />
                <Row label="Kernel" value={data.pi.osRelease} />
                {data.pi.dbFileSize !== null && (
                  <Row label="DB file" value={fmtBytes(data.pi.dbFileSize)} />
                )}
              </div>
            </Card>

            {/* Sensor */}
            <Card title="Sensor">
              {data.sensor ? (
                <>
                  {data.sensor.wifi !== null && (
                    <BarRow
                      label="WiFi signal"
                      value={data.sensor.wifi}
                      max={100}
                      display={`${data.sensor.wifi}%`}
                    />
                  )}
                  <div className="pt-1 divide-y divide-zinc-800/60">
                    <Row label="Serial" value={data.sensor.serialno ?? '—'} />
                    <Row label="Model" value={data.sensor.model ?? '—'} />
                    <Row label="Firmware" value={data.sensor.firmware ?? '—'} />
                    {data.sensor.bootCount !== null && (
                      <Row label="Boot count" value={String(data.sensor.bootCount)} />
                    )}
                    {data.sensor.boot !== null && (
                      <Row label="Sensor uptime" value={fmtUptime(data.sensor.boot)} />
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-zinc-500 py-2">No sensor data yet — waiting for first reading.</p>
              )}
            </Card>

            {/* Poller & App */}
            <Card title="Poller & App">
              <div className="flex items-center gap-2 pb-1">
                {data.poller.error ? (
                  <span className="text-xs px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400">
                    {data.poller.error}
                  </span>
                ) : data.poller.ip ? (
                  <span className="text-xs px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                    Connected
                  </span>
                ) : (
                  <span className="text-xs px-2.5 py-1 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-400">
                    No device
                  </span>
                )}
              </div>
              <div className="divide-y divide-zinc-800/60">
                <Row label="Device IP" value={data.poller.ip ?? '—'} />
                <Row label="Readings stored" value={data.db.readingCount.toLocaleString()} />
                <Row label="Node.js" value={data.app.nodeVersion} />
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
