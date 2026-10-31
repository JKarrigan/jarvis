import os from 'os'
import { readFileSync } from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { getLatestReading, getReadingCount } from '@/lib/db'
import { getPollerStatus } from '@/lib/poller'

export const dynamic = 'force-dynamic'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'airgradient.db')

type CpuTimes = { user: number; nice: number; sys: number; idle: number; irq: number }
const g = globalThis as typeof globalThis & { __ag_cpu_snapshot?: CpuTimes[] }

function getCpuUsages(): number[] {
  const current = os.cpus().map(c => c.times)
  const prev = g.__ag_cpu_snapshot
  g.__ag_cpu_snapshot = current
  if (!prev || prev.length !== current.length) return current.map(() => 0)
  return current.map((cur, i) => {
    const p = prev[i]
    const deltaIdle = cur.idle - p.idle
    const deltaTotal = (cur.user - p.user) + (cur.nice - p.nice) + (cur.sys - p.sys) + (cur.idle - p.idle) + (cur.irq - p.irq)
    if (deltaTotal === 0) return 0
    return Math.round((1 - deltaIdle / deltaTotal) * 100)
  })
}

function getCpuTemp(): number | null {
  try {
    const raw = readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8')
    return parseInt(raw.trim()) / 1000
  } catch {
    return null
  }
}

/**
 * Available memory: MemAvailable from /proc/meminfo (counts reclaimable page
 * cache, unlike os.freemem() which makes a Pi always look ~90 % full);
 * falls back to os.freemem() off Linux.
 */
function getAvailableMemory(): number {
  try {
    const m = /^MemAvailable:\s+(\d+)\s+kB/m.exec(readFileSync('/proc/meminfo', 'utf8'))
    if (m) return Number(m[1]) * 1024
  } catch { /* not Linux */ }
  return os.freemem()
}

/** `df -h`-style size string (1024-based, e.g. "29G", "3.4G", "512M"). */
function humanSize(bytes: number): string {
  const units = ['B', 'K', 'M', 'G', 'T', 'P']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${i > 0 && v < 10 ? v.toFixed(1) : Math.round(v)}${units[i]}`
}

/** Root filesystem usage, same shape as the old `df -h /` parse (no subprocess). */
async function getDisk(): Promise<{ total: string; used: string; available: string; usedPercent: string } | null> {
  try {
    const s = await fsp.statfs('/')
    const total = s.blocks * s.bsize
    const used = (s.blocks - s.bfree) * s.bsize
    const available = s.bavail * s.bsize
    // df's Use% is used / (used + available to unprivileged users), rounded up.
    const pct = used + available > 0 ? Math.ceil((used / (used + available)) * 100) : 0
    return { total: humanSize(total), used: humanSize(used), available: humanSize(available), usedPercent: `${pct}%` }
  } catch {
    return null
  }
}

async function getDbFileSize(): Promise<number | null> {
  try {
    return (await fsp.stat(DB_PATH)).size
  } catch {
    return null
  }
}

export async function GET() {
  const cpus = os.cpus()
  const cpuUsages = getCpuUsages()
  const latest = getLatestReading()
  const [disk, dbFileSize] = await Promise.all([getDisk(), getDbFileSize()])

  const sensor = latest?.measures ? {
    serialno: latest.measures.serialno ?? null,
    firmware: latest.measures.firmware ?? null,
    model: latest.measures.model ?? null,
    wifi: latest.measures.wifi ?? null,
    bootCount: latest.measures.bootCount ?? null,
    boot: latest.measures.boot ?? null,
  } : null

  return Response.json({
    pi: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      osRelease: os.release(),
      uptime: os.uptime(),
      loadAvg: os.loadavg(),
      cpu: {
        model: cpus[0]?.model ?? 'Unknown',
        cores: cpus.map((c, i) => ({ id: i, usagePct: cpuUsages[i] ?? 0 })),
      },
      // `free` is *available* memory (see getAvailableMemory); the client shows total - free as used.
      memory: { total: os.totalmem(), free: getAvailableMemory() },
      disk,
      cpuTemp: getCpuTemp(),
      dbFileSize,
    },
    sensor,
    poller: getPollerStatus(),
    db: { readingCount: getReadingCount() },
    app: { nodeVersion: process.version },
  })
}
