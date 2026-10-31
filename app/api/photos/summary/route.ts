import fs from 'fs'
import { PHOTOS_ROOT } from '@/lib/photos/config'
import { getSummaryCounts } from '@/lib/photos/db'
import { getScanStatusLive } from '@/lib/photos/scan'
import type { PhotoSummary } from '@/lib/photos/types'

export const dynamic = 'force-dynamic'

async function diskOf(dir: string): Promise<{ totalBytes: number; freeBytes: number }> {
  try {
    const s = await fs.promises.statfs(dir)
    return { totalBytes: s.blocks * s.bsize, freeBytes: s.bavail * s.bsize }
  } catch {
    return { totalBytes: 0, freeBytes: 0 }
  }
}

// GET /api/photos/summary — counts per year/month, totals, disk usage, last scan.
export async function GET() {
  const c = getSummaryCounts()
  const [disk, scan] = await Promise.all([diskOf(PHOTOS_ROOT), getScanStatusLive()])
  const body: PhotoSummary = {
    total: c.total,
    images: c.images,
    videos: c.videos,
    favorites: c.favorites,
    trashCount: c.trashCount,
    years: c.years,
    months: c.months,
    diskUsage: { libraryBytes: c.libraryBytes, trashBytes: c.trashBytes, ...disk },
    lastScan: scan.lastScan,
    scanning: scan.running,
    libraryOnline: scan.libraryOnline,
  }
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
