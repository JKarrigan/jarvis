import os from 'os'
import { execSync } from 'child_process'
import { readFileSync, statSync } from 'fs'
import path from 'path'
import { getLatestReading, getReadingCount } from '@/lib/db'
import { getPollerStatus } from '@/lib/poller'

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

function getDisk(): { total: string; used: string; available: string; usedPercent: string } | null {
  try {
    const out = execSync('df -h /', { encoding: 'utf8', timeout: 3000 })
    const line = out.trim().split('\n')[1]
    const parts = line.split(/\s+/)
    return { total: parts[1], used: parts[2], available: parts[3], usedPercent: parts[4] }
  } catch {
    return null
  }
}

function getDbFileSize(): number | null {
  try {
    return statSync(DB_PATH).size
  } catch {
    return null
  }
}

export async function GET() {
  const cpus = os.cpus()
  const cpuUsages = getCpuUsages()
  const latest = getLatestReading()

  const sensor = latest ? {
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
      memory: { total: os.totalmem(), free: os.freemem() },
      disk: getDisk(),
      cpuTemp: getCpuTemp(),
      dbFileSize: getDbFileSize(),
    },
    sensor,
    poller: getPollerStatus(),
    db: { readingCount: getReadingCount() },
    app: { nodeVersion: process.version },
  })
}
