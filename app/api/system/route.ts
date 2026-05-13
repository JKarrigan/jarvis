import os from 'os'
import { execSync } from 'child_process'
import { readFileSync, statSync } from 'fs'
import path from 'path'
import { getLatestReading, getReadingCount } from '@/lib/db'
import { getPollerStatus } from '@/lib/poller'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'airgradient.db')

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
      cpu: { model: cpus[0]?.model ?? 'Unknown', cores: cpus.length },
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
